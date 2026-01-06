//! Terminal/Exec commands

use crate::auth::license_client::LicenseClient;
use crate::commands::helpers::ResourceContext;
use crate::error::Result;
use crate::state::AppState;
use crate::terminal::TerminalConfig;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Terminal session info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionInfo {
    pub id: String,
    pub pod: String,
    pub container: String,
    pub namespace: String,
    pub created_at: String,
}

/// Send input to terminal session
#[tauri::command]
pub async fn terminal_input(
    session_id: String,
    data: String,
    state: State<'_, AppState>,
) -> Result<()> {
    state.terminal_manager.send_input(&session_id, &data).await
}

/// Resize terminal session
#[tauri::command]
pub async fn terminal_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
) -> Result<()> {
    state.terminal_manager.resize_session(&session_id, cols, rows).await
}

/// Close terminal session
#[tauri::command]
pub fn close_terminal(session_id: String, state: State<'_, AppState>) -> Result<()> {
    state.terminal_manager.close_session(&session_id)
}

/// Open a shell in a pod
#[tauri::command]
pub async fn open_shell(
    namespace: String,
    pod: String,
    container: Option<String>,
    shell: Option<String>,
    state: State<'_, AppState>,
    license: State<'_, LicenseClient>,
) -> Result<String> {
    license.require_premium_license().await?;

    let ctx = ResourceContext::for_command(&state, Some(namespace.clone()))?;
    let client = ctx.client.clone(); 

    // Get container name if not provided
    let container_name = if let Some(c) = container {
        c
    } else {
        let pod_obj: k8s_openapi::api::core::v1::Pod = ctx.namespaced_api().get(&pod).await?;
        pod_obj
            .spec
            .and_then(|s| s.containers.first().map(|c| c.name.clone()))
            .unwrap_or_else(String::new)
    };

    let session_id = format!("shell-{}-{}-{}", namespace, pod, uuid::Uuid::new_v4());

    let mut config = if let Some(sh) = shell {
         TerminalConfig {
            command: vec![sh],
            ..TerminalConfig::default()
        }
    } else {
        TerminalConfig::smart_default(&pod, &namespace)
    };
    
    config.pod = pod;
    config.namespace = namespace;
    config.container = Some(container_name);
    // Explicitly ensure defaults for interactive shell
    config.tty = true;
    config.stdin = true;
    config.stdout = true;
    config.stderr = false; // TTY implies stderr merged

    state.terminal_manager.start_session(client, session_id.clone(), config).await?;

    Ok(session_id)
}
