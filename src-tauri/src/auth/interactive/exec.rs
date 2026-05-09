//! Exec-credential authentication flow + browser-script helpers.
//!
//! When kubeconfig declares an `exec` block, we either short-circuit
//! through `cloud::try_native_cloud_auth` or actually spawn the exec
//! command in a terminal session, capturing its stdout (the JSON
//! `ExecCredential`) and any auth URL it printed via the
//! `BROWSER` / `K8S_GUI_AUTH_URL_FILE` env hooks.

use crate::commands::kubectl::kubectl_manager;
use crate::error::{AuthError, Error, Result};
use crate::state::{AppEvent, AppState};
use kube::config::{ExecAuthCluster, ExecConfig, ExecInteractiveMode};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::time::{Duration, Instant};

use super::cloud::{resolve_cloud_cli_path, try_native_cloud_auth};
use super::cred::{
    ExecCredential, ExecCredentialRequest, ExecCredentialSpec, ExecCredentialStatus,
    ExecTerminalParams,
};

pub(super) async fn run_exec_auth(
    state: &AppState,
    context: &str,
    exec: &ExecConfig,
    exec_cluster: Option<ExecAuthCluster>,
) -> Result<ExecCredentialStatus> {
    // Try native cloud authentication first
    if let Some(result) = try_native_cloud_auth(exec, context).await {
        return result;
    }

    let (session_id, mut cancel_rx) = state.create_auth_session(context, "exec");
    let (browser_script, url_file, bin_dir) = match create_browser_script(&session_id) {
        Ok(paths) => paths,
        Err(err) => {
            state.remove_auth_session(&session_id);
            return Err(err);
        }
    };

    let params =
        match build_exec_terminal_params(exec, &browser_script, &url_file, &bin_dir, exec_cluster)
            .await
        {
            Ok(params) => params,
            Err(err) => {
                cleanup_auth_artifacts(&browser_script, &url_file, &bin_dir);
                state.remove_auth_session(&session_id);
                return Err(err);
            }
        };

    // Subscribe to events BEFORE creating session to avoid race condition
    let mut event_rx = state.event_tx.subscribe();

    // Create terminal session for exec auth
    let adapter = crate::terminal::AuthExecAdapter::new(
        params.command.clone(),
        params.args.clone(),
        params.env,
    );

    // Extract collected_stdout Arc before moving adapter
    let collected_stdout = adapter.collected_stdout();

    let terminal_session_id = state
        .terminal_manager
        .create_session(Box::new(adapter))
        .await
        .map_err(|e| {
            cleanup_auth_artifacts(&browser_script, &url_file, &bin_dir);
            state.remove_auth_session(&session_id);
            Error::Auth(AuthError::Kubeconfig(format!(
                "Failed to create terminal session: {e}"
            )))
        })?;

    // Emit AuthTerminalSessionCreated event
    state.emit(AppEvent::AuthTerminalSessionCreated {
        auth_session_id: session_id.clone(),
        terminal_session_id: terminal_session_id.clone(),
        context: context.to_string(),
        command: format!("{} {}", params.command, params.args.join(" ")),
    });

    let mut url_emitted = false;
    let mut last_url = String::new();
    let mut interval = tokio::time::interval(Duration::from_millis(250));
    let started = Instant::now();

    // Wait for terminal session to complete
    loop {
        tokio::select! {
            Ok(event) = event_rx.recv() => {
                if let AppEvent::TerminalClosed { session_id: sid, .. } = event {
                    if sid == terminal_session_id {
                        break;
                    }
                }
            }
            _ = interval.tick() => {
                if !url_emitted {
                    if let Ok(url) = read_auth_url(&url_file).await {
                        if !url.is_empty() && url != last_url {
                            last_url.clone_from(&url);
                            url_emitted = true;
                            state.emit(AppEvent::AuthUrlRequested {
                                context: context.to_string(),
                                url,
                                flow: "exec".to_string(),
                                session_id: Some(session_id.clone()),
                            });
                        }
                    }
                }
            }
            _ = &mut cancel_rx => {
                state.terminal_manager.close_session(&terminal_session_id)?;
                cleanup_auth_artifacts(&browser_script, &url_file, &bin_dir);
                state.remove_auth_session(&session_id);
                state.emit(AppEvent::AuthFlowCancelled {
                    session_id,
                    context: context.to_string(),
                    message: Some("Authentication cancelled.".to_string()),
                });
                return Err(Error::Auth(AuthError::Kubeconfig("Authentication cancelled".to_string())));
            }
        }
        if started.elapsed() > Duration::from_secs(180) {
            state.terminal_manager.close_session(&terminal_session_id)?;
            cleanup_auth_artifacts(&browser_script, &url_file, &bin_dir);
            state.remove_auth_session(&session_id);
            state.emit(AppEvent::AuthFlowCompleted {
                session_id,
                context: context.to_string(),
                success: false,
                message: Some("Authentication timed out.".to_string()),
            });
            return Err(Error::Timeout("Authentication timed out".to_string()));
        }
    }

    cleanup_auth_artifacts(&browser_script, &url_file, &bin_dir);
    state.remove_auth_session(&session_id);

    // Read collected stdout from terminal session
    let stdout_data = collected_stdout.lock();

    if stdout_data.is_empty() {
        state.emit(AppEvent::AuthFlowCompleted {
            session_id,
            context: context.to_string(),
            success: false,
            message: Some("No output from auth process".to_string()),
        });
        return Err(Error::Auth(AuthError::Kubeconfig(
            "No output from auth process".to_string(),
        )));
    }

    let creds: ExecCredential = serde_json::from_slice(&stdout_data).map_err(|e| {
        Error::Auth(AuthError::Kubeconfig(format!(
            "Invalid exec credentials: {e}"
        )))
    })?;
    let status = creds.status.ok_or_else(|| {
        Error::Auth(AuthError::Kubeconfig(
            "Exec credentials missing status".to_string(),
        ))
    })?;
    if status.token.is_none()
        && (status.client_certificate_data.is_none() || status.client_key_data.is_none())
    {
        state.emit(AppEvent::AuthFlowCompleted {
            session_id,
            context: context.to_string(),
            success: false,
            message: Some("Exec credentials missing token.".to_string()),
        });
        return Err(Error::Auth(AuthError::Kubeconfig(
            "Exec credentials missing token".to_string(),
        )));
    }

    state.emit(AppEvent::AuthFlowCompleted {
        session_id,
        context: context.to_string(),
        success: true,
        message: None,
    });

    Ok(status)
}

async fn build_exec_terminal_params(
    exec: &ExecConfig,
    browser_script: &std::path::Path,
    url_file: &std::path::Path,
    bin_dir: &std::path::Path,
    exec_cluster: Option<ExecAuthCluster>,
) -> Result<ExecTerminalParams> {
    let command = exec
        .command
        .as_ref()
        .ok_or_else(|| Error::Auth(AuthError::Kubeconfig("Exec command missing".to_string())))?;

    // Try to resolve the command path for cloud CLIs
    let resolved_command = resolve_cloud_cli_path(command)
        .await
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| command.clone());

    // Collect args
    let args = exec.args.clone().unwrap_or_default();

    // Collect env
    let mut env = HashMap::new();
    if let Some(exec_env) = &exec.env {
        for entry in exec_env {
            if let (Some(name), Some(value)) = (entry.get("name"), entry.get("value")) {
                env.insert(name.clone(), value.clone());
            }
        }
    }

    let interactive = exec.interactive_mode != Some(ExecInteractiveMode::Never);
    let exec_info = ExecCredentialRequest {
        api_version: exec.api_version.clone(),
        kind: Some("ExecCredential".to_string()),
        spec: Some(ExecCredentialSpec {
            interactive: Some(interactive),
            cluster: exec_cluster,
        }),
        status: None,
    };
    let exec_info = serde_json::to_string(&exec_info).map_err(|e| {
        Error::Auth(AuthError::Kubeconfig(format!(
            "Exec info serialize failed: {e}"
        )))
    })?;

    env.insert("KUBERNETES_EXEC_INFO".to_string(), exec_info);
    env.insert(
        "K8S_GUI_AUTH_URL_FILE".to_string(),
        url_file.to_string_lossy().to_string(),
    );
    env.insert(
        "BROWSER".to_string(),
        browser_script.to_string_lossy().to_string(),
    );

    // Find kubectl directory to add to PATH (for exec plugins like oidc-login)
    let kubectl_dir = kubectl_manager()
        .await
        .resolve_path()
        .await
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_string_lossy().to_string()));

    // Prepend our bin directory and kubectl directory to PATH
    // Use shell-resolved PATH to include homebrew and user paths
    let current_path = crate::shell::get_user_path();
    let current_path = if current_path.is_empty() {
        std::env::var("PATH").unwrap_or_default()
    } else {
        current_path.to_string()
    };

    // Use OS-agnostic path separator (';' on Windows, ':' on Unix)
    let sep = crate::cli::PathResolver::separator();
    let new_path = match kubectl_dir {
        Some(kdir) => format!("{}{sep}{kdir}{sep}{current_path}", bin_dir.display()),
        None => format!("{}{sep}{current_path}", bin_dir.display()),
    };
    env.insert("PATH".to_string(), new_path);

    Ok(ExecTerminalParams {
        command: resolved_command,
        args,
        env,
    })
}

async fn read_auth_url(path: &PathBuf) -> Result<String> {
    let contents = tokio::fs::read_to_string(path).await?;
    Ok(contents.trim().to_string())
}

fn create_browser_script(session_id: &str) -> Result<(PathBuf, PathBuf, PathBuf)> {
    let mut dir = std::env::temp_dir();
    dir.push("k8s-gui-auth");
    dir.push(session_id);
    std::fs::create_dir_all(&dir)?;

    let mut url_file = dir.clone();
    url_file.push("auth-url.txt");

    let mut script_path = dir.clone();

    // Create bin directory for PATH override
    let mut bin_dir = dir.clone();
    bin_dir.push("bin");
    std::fs::create_dir_all(&bin_dir)?;

    #[cfg(target_os = "windows")]
    {
        script_path.push("open-url.cmd");
        let script = "@echo off\r\nif \"%1\"==\"\" exit /b 0\r\necho %1> \"%K8S_GUI_AUTH_URL_FILE%\"\r\nexit /b 0\r\n";
        std::fs::write(&script_path, script)?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        script_path.push("open-url.sh");
        // Script that captures URL and writes to file
        let script = r#"#!/bin/sh
if [ -n "$1" ]; then
  printf "%s" "$1" > "$K8S_GUI_AUTH_URL_FILE"
fi
exit 0
"#;
        std::fs::write(&script_path, script)?;

        // Create fake 'open' command for macOS (gcloud uses 'open' directly)
        #[cfg(target_os = "macos")]
        {
            let mut open_script = bin_dir.clone();
            open_script.push("open");
            let open_script_content = r#"#!/bin/sh
# Intercept 'open' command to capture auth URLs
for arg in "$@"; do
  case "$arg" in
    http://*|https://*)
      if [ -n "$K8S_GUI_AUTH_URL_FILE" ]; then
        printf "%s" "$arg" > "$K8S_GUI_AUTH_URL_FILE"
        exit 0
      fi
      ;;
  esac
done
# Fall back to real open for non-URL arguments
exec /usr/bin/open "$@"
"#;
            std::fs::write(&open_script, open_script_content)?;
        }

        // Create fake 'xdg-open' for Linux
        #[cfg(target_os = "linux")]
        {
            let mut xdg_script = bin_dir.clone();
            xdg_script.push("xdg-open");
            let xdg_script_content = r#"#!/bin/sh
# Intercept 'xdg-open' command to capture auth URLs
for arg in "$@"; do
  case "$arg" in
    http://*|https://*)
      if [ -n "$K8S_GUI_AUTH_URL_FILE" ]; then
        printf "%s" "$arg" > "$K8S_GUI_AUTH_URL_FILE"
        exit 0
      fi
      ;;
  esac
done
# Fall back to real xdg-open for non-URL arguments
exec /usr/bin/xdg-open "$@"
"#;
            std::fs::write(&xdg_script, xdg_script_content)?;
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&script_path)?.permissions();
            perms.set_mode(0o700);
            std::fs::set_permissions(&script_path, perms)?;

            // Make all scripts in bin directory executable
            if let Ok(entries) = std::fs::read_dir(&bin_dir) {
                for entry in entries.flatten() {
                    if let Ok(mut perms) = std::fs::metadata(entry.path()).map(|m| m.permissions())
                    {
                        perms.set_mode(0o700);
                        let _ = std::fs::set_permissions(entry.path(), perms);
                    }
                }
            }
        }
    }

    Ok((script_path, url_file, bin_dir))
}

fn cleanup_auth_artifacts(script_path: &PathBuf, url_file: &PathBuf, bin_dir: &PathBuf) {
    let _ = std::fs::remove_file(script_path);
    let _ = std::fs::remove_file(url_file);
    let _ = std::fs::remove_dir_all(bin_dir);
}
