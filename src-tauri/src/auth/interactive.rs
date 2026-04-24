//! Interactive authentication helpers for exec and OIDC flows.

use crate::auth::OidcAuth;
use crate::auth::{
    is_aks_exec_command, is_gke_exec_command, parse_aks_exec_args, AuthProvider, AzureAksAuth,
    GcpGkeAuth,
};
use crate::cli::cloud::{AzTool, GcloudTool, GkeAuthPluginTool, KubeloginTool};
use crate::cli::CliToolManager;
use crate::commands::kubectl::kubectl_manager;
use crate::config::AppConfig;
use crate::error::{AuthError, Error, Result};
use crate::state::{AppEvent, AppState};
use kube::config::{
    AuthInfo, AuthProviderConfig, ExecAuthCluster, ExecConfig, ExecInteractiveMode, Kubeconfig,
};
use once_cell::sync::Lazy;
use secrecy::SecretString;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::time::{Duration, Instant};
use url::Url;

// Global cloud CLI managers
static GCLOUD: Lazy<CliToolManager<GcloudTool>> =
    Lazy::new(|| CliToolManager::new(GcloudTool::new()));

static GKE_AUTH_PLUGIN: Lazy<CliToolManager<GkeAuthPluginTool>> =
    Lazy::new(|| CliToolManager::new(GkeAuthPluginTool::new()));

static AZ: Lazy<CliToolManager<AzTool>> = Lazy::new(|| CliToolManager::new(AzTool::new()));

static KUBELOGIN: Lazy<CliToolManager<KubeloginTool>> =
    Lazy::new(|| CliToolManager::new(KubeloginTool::new()));

#[derive(Debug, Deserialize)]
struct ExecCredential {
    status: Option<ExecCredentialStatus>,
}

#[derive(Debug, Deserialize)]
struct ExecCredentialStatus {
    #[serde(rename = "expirationTimestamp")]
    expiration_timestamp: Option<String>,
    token: Option<String>,
    #[serde(rename = "clientCertificateData")]
    client_certificate_data: Option<String>,
    #[serde(rename = "clientKeyData")]
    client_key_data: Option<String>,
}

#[derive(Debug, Serialize)]
struct ExecCredentialSpec {
    #[serde(skip_serializing_if = "Option::is_none")]
    interactive: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cluster: Option<ExecAuthCluster>,
}

#[derive(Debug, Serialize)]
struct ExecCredentialRequest {
    kind: Option<String>,
    #[serde(rename = "apiVersion")]
    api_version: Option<String>,
    spec: Option<ExecCredentialSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<serde_json::Value>,
}

/// Parameters for creating a terminal session for exec auth
struct ExecTerminalParams {
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
}

/// Prepare kubeconfig for a context, handling exec auth if needed
///
/// # Errors
///
/// Returns an error if the context cannot be resolved, exec authentication fails,
/// or kubeconfig processing fails.
pub async fn prepare_kubeconfig_for_context(
    state: &AppState,
    mut kubeconfig: Kubeconfig,
    context_name: &str,
) -> Result<Kubeconfig> {
    let (user_name, cluster_name) = resolve_context(&kubeconfig, context_name)?;

    // First, get the exec config and check if we need cluster info
    let (exec_config, needs_cluster_info) = {
        let auth_info = find_auth_info_mut(&mut kubeconfig, &user_name)?;
        if let Some(exec) = auth_info.exec.clone() {
            (Some(exec.clone()), exec.provide_cluster_info)
        } else {
            (None, false)
        }
    };

    // Now resolve cluster info if needed (kubeconfig is no longer mutably borrowed)
    let exec_cluster = if needs_cluster_info {
        resolve_exec_cluster(&kubeconfig, &cluster_name)?
    } else {
        None
    };

    // Get auth_info again for modification
    let auth_info = find_auth_info_mut(&mut kubeconfig, &user_name)?;

    if let Some(exec) = exec_config {
        let status = run_exec_auth(state, context_name, &exec, exec_cluster).await?;
        apply_exec_credentials(auth_info, status);
        auth_info.exec = None;
        auth_info.auth_provider = None;
        return Ok(kubeconfig);
    }

    if let Some(provider) = auth_info.auth_provider.clone() {
        if provider.name == "oidc" {
            let oidc_result = run_oidc_auth(state, context_name, &provider).await?;
            auth_info.token = Some(SecretString::from(oidc_result.token));
            auth_info.auth_provider = None;
        }
    }

    Ok(kubeconfig)
}

fn resolve_context(kubeconfig: &Kubeconfig, context_name: &str) -> Result<(String, String)> {
    let context = kubeconfig
        .contexts
        .iter()
        .find(|ctx| ctx.name == context_name)
        .and_then(|ctx| ctx.context.as_ref())
        .ok_or_else(|| Error::Config(format!("Context {context_name} not found")))?;

    let user = context
        .user
        .clone()
        .ok_or_else(|| Error::Config(format!("Context {context_name} has no user")))?;
    Ok((user, context.cluster.clone()))
}

fn find_auth_info_mut<'a>(
    kubeconfig: &'a mut Kubeconfig,
    user_name: &str,
) -> Result<&'a mut AuthInfo> {
    let auth_info = kubeconfig
        .auth_infos
        .iter_mut()
        .find(|info| info.name == user_name)
        .ok_or_else(|| Error::Config(format!("Auth info {user_name} not found")))?;

    Ok(auth_info.auth_info.get_or_insert_with(AuthInfo::default))
}

fn resolve_exec_cluster(
    kubeconfig: &Kubeconfig,
    cluster_name: &str,
) -> Result<Option<ExecAuthCluster>> {
    let cluster = kubeconfig
        .clusters
        .iter()
        .find(|cluster| cluster.name == cluster_name)
        .and_then(|cluster| cluster.cluster.as_ref())
        .ok_or_else(|| Error::Config(format!("Cluster {cluster_name} not found")))?;

    let exec_cluster = ExecAuthCluster::try_from(cluster)
        .map_err(|e| Error::Config(format!("Failed to load cluster info: {e}")))?;
    Ok(Some(exec_cluster))
}

fn apply_exec_credentials(auth_info: &mut AuthInfo, status: ExecCredentialStatus) {
    if let Some(token) = status.token {
        auth_info.token = Some(SecretString::from(token));
    }
    if let Some(cert) = status.client_certificate_data {
        auth_info.client_certificate_data = Some(cert);
    }
    if let Some(key) = status.client_key_data {
        auth_info.client_key_data = Some(SecretString::from(key));
    }
    if let Some(expiry) = status.expiration_timestamp {
        let _ = expiry;
    }
}

/// Try native authentication for cloud providers (GKE, AKS)
/// Returns None if native auth is not applicable or disabled
async fn try_native_cloud_auth(
    exec: &ExecConfig,
    context: &str,
) -> Option<Result<ExecCredentialStatus>> {
    let command = exec.command.as_ref()?;
    let config = AppConfig::load().ok()?;

    // Try GKE native auth
    if is_gke_exec_command(command) {
        // Get profile for this context, or use defaults (ADC)
        let gcp_profile = config.cloud.get_gcp_profile_for_context(context);
        let prefer_native = gcp_profile.map(|p| p.prefer_native_auth).unwrap_or(true);

        if prefer_native {
            tracing::info!(
                "Attempting native GCP authentication for context: {}",
                context
            );

            let service_account_path = gcp_profile
                .and_then(|p| p.service_account_key_path.clone())
                .map(std::path::PathBuf::from);
            let auth = GcpGkeAuth::new(service_account_path);

            match auth.authenticate().await {
                Ok(result) => {
                    tracing::info!("Native GCP authentication successful");
                    return Some(Ok(ExecCredentialStatus {
                        expiration_timestamp: result.expires_at.map(|t| t.to_rfc3339()),
                        token: Some(result.token),
                        client_certificate_data: None,
                        client_key_data: None,
                    }));
                }
                Err(e) => {
                    tracing::warn!(
                        "Native GCP authentication failed, will try exec fallback: {}",
                        e
                    );
                    // Continue to exec fallback
                }
            }
        }
    }

    // Try AKS native auth
    if is_aks_exec_command(command) {
        // Get profile for this context, or use defaults
        let azure_profile = config.cloud.get_azure_profile_for_context(context);
        let prefer_native = azure_profile.map(|p| p.prefer_native_auth).unwrap_or(true);

        if prefer_native {
            tracing::info!(
                "Attempting native Azure authentication for context: {}",
                context
            );

            let aks_info = exec
                .args
                .as_ref()
                .and_then(|args| parse_aks_exec_args(args));
            let tenant_id = aks_info
                .as_ref()
                .and_then(|i| i.tenant_id.clone())
                .or_else(|| azure_profile.and_then(|p| p.tenant_id.clone()));

            let use_cli_fallback = azure_profile.map(|p| p.use_cli_fallback).unwrap_or(false);
            let auth = AzureAksAuth::new(use_cli_fallback, tenant_id);

            match auth.authenticate().await {
                Ok(result) => {
                    tracing::info!("Native Azure authentication successful");
                    return Some(Ok(ExecCredentialStatus {
                        expiration_timestamp: result.expires_at.map(|t| t.to_rfc3339()),
                        token: Some(result.token),
                        client_certificate_data: None,
                        client_key_data: None,
                    }));
                }
                Err(e) => {
                    tracing::warn!(
                        "Native Azure authentication failed, will try exec fallback: {}",
                        e
                    );
                    // Continue to exec fallback
                }
            }
        }
    }

    None
}

/// Resolve cloud CLI binary path using unified CLI infrastructure
async fn resolve_cloud_cli_path(command: &str) -> Option<PathBuf> {
    // Check if command is already an absolute path
    let cmd_path = PathBuf::from(command);
    if cmd_path.is_absolute() && cmd_path.exists() {
        return Some(cmd_path);
    }

    // Use appropriate CLI manager based on command type
    if is_gke_exec_command(command) {
        // Try gke-gcloud-auth-plugin first, then gcloud
        if let Ok(path) = GKE_AUTH_PLUGIN.resolve_path().await {
            return Some(path);
        }
        if let Ok(path) = GCLOUD.resolve_path().await {
            return Some(path);
        }
    }

    if is_aks_exec_command(command) {
        // Try kubelogin first, then az
        if let Ok(path) = KUBELOGIN.resolve_path().await {
            return Some(path);
        }
        if let Ok(path) = AZ.resolve_path().await {
            return Some(path);
        }
    }

    None
}

async fn run_exec_auth(
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
    let stdout_data = collected_stdout.read().await;

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

async fn run_oidc_auth(
    state: &AppState,
    context: &str,
    provider: &AuthProviderConfig,
) -> Result<crate::auth::AuthResult> {
    let config = &provider.config;
    let issuer_url = config
        .get("idp-issuer-url")
        .ok_or_else(|| Error::Auth(AuthError::Oidc("Missing issuer URL".to_string())))?
        .clone();
    let client_id = config
        .get("client-id")
        .ok_or_else(|| Error::Auth(AuthError::Oidc("Missing client ID".to_string())))?
        .clone();
    let client_secret = config.get("client-secret").cloned();
    let scopes = parse_scopes(config);

    let auth = OidcAuth::new(issuer_url, client_id, client_secret, scopes);
    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let redirect_port = listener.local_addr()?.port();
    let redirect_uri = format!("http://127.0.0.1:{redirect_port}/callback");

    let auth_url = auth.generate_auth_url(&redirect_uri).await?;
    let (session_id, mut cancel_rx) = state.create_auth_session(context, "oidc");

    state.emit(AppEvent::AuthUrlRequested {
        context: context.to_string(),
        url: auth_url.url.clone(),
        flow: "oidc".to_string(),
        session_id: Some(session_id.clone()),
    });

    let callback_fut = wait_for_oidc_callback(listener);
    tokio::pin!(callback_fut);

    let callback_result = tokio::select! {
        result = &mut callback_fut => result,
        _ = &mut cancel_rx => {
            state.remove_auth_session(&session_id);
            state.emit(AppEvent::AuthFlowCancelled {
                session_id,
                context: context.to_string(),
                message: Some("Authentication cancelled.".to_string()),
            });
            return Err(Error::Auth(AuthError::Oidc("Authentication cancelled".to_string())));
        }
        () = tokio::time::sleep(Duration::from_secs(180)) => {
            state.remove_auth_session(&session_id);
            state.emit(AppEvent::AuthFlowCompleted {
                session_id,
                context: context.to_string(),
                success: false,
                message: Some("Authentication timed out.".to_string()),
            });
            return Err(Error::Timeout("Authentication timed out".to_string()));
        }
    };

    let callback = match callback_result {
        Ok(callback) => callback,
        Err(err) => {
            state.remove_auth_session(&session_id);
            state.emit(AppEvent::AuthFlowCompleted {
                session_id,
                context: context.to_string(),
                success: false,
                message: Some(err.to_string()),
            });
            return Err(err);
        }
    };

    if callback.state != auth_url.state {
        state.remove_auth_session(&session_id);
        state.emit(AppEvent::AuthFlowCompleted {
            session_id,
            context: context.to_string(),
            success: false,
            message: Some("OIDC state mismatch.".to_string()),
        });
        return Err(Error::Auth(AuthError::Oidc(
            "OIDC state mismatch".to_string(),
        )));
    }

    let auth_result = auth
        .exchange_code(&callback.code, &redirect_uri, &auth_url.code_verifier)
        .await?;

    state.remove_auth_session(&session_id);
    state.emit(AppEvent::AuthFlowCompleted {
        session_id,
        context: context.to_string(),
        success: true,
        message: None,
    });

    Ok(auth_result)
}

fn parse_scopes(config: &HashMap<String, String>) -> Vec<String> {
    config
        .get("extra-scopes")
        .map(|scopes| {
            scopes
                .split([',', ' '])
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default()
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

struct OidcCallback {
    code: String,
    state: String,
}

/// Buffer size for OIDC callback reading
const OIDC_CALLBACK_BUFFER_SIZE: usize = 4096;

async fn wait_for_oidc_callback(listener: TcpListener) -> Result<OidcCallback> {
    let (mut socket, _) = listener.accept().await?;
    let mut buf = [0u8; OIDC_CALLBACK_BUFFER_SIZE];
    let n = socket.read(&mut buf).await?;
    if n == 0 {
        return Err(Error::Auth(AuthError::Oidc(
            "OIDC callback empty".to_string(),
        )));
    }
    let request = String::from_utf8_lossy(&buf[..n]);
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");
    let url = Url::parse(&format!("http://localhost{path}"))
        .map_err(|e| Error::Auth(AuthError::Oidc(format!("OIDC callback parse failed: {e}"))))?;

    let mut code = None;
    let mut state = None;
    for (key, value) in url.query_pairs() {
        if key == "code" {
            code = Some(value.to_string());
        }
        if key == "state" {
            state = Some(value.to_string());
        }
    }

    let body = "<html><body>Authentication complete. You can close this window.</body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = socket.write_all(response.as_bytes()).await;

    let code = code.ok_or_else(|| Error::Auth(AuthError::Oidc("Missing code".to_string())))?;
    let state = state.ok_or_else(|| Error::Auth(AuthError::Oidc("Missing state".to_string())))?;

    Ok(OidcCallback { code, state })
}
