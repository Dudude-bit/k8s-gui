//! Terminal/Exec commands

use crate::commands::helpers::ResourceContext;
use crate::error::Result;
use crate::state::AppState;
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
    state
        .terminal_manager
        .resize_session(&session_id, cols, rows)
        .await
}

/// Close terminal session
#[tauri::command]
pub fn close_terminal(session_id: String, state: State<'_, AppState>) -> Result<()> {
    state.terminal_manager.close_session(&session_id)
}

/// Open a shell in a pod
#[tauri::command]
pub async fn open_pod_shell(
    namespace: String,
    pod: String,
    container: Option<String>,
    _shell: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
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

    // Create adapter and session
    // Use provided shell or smart shell detection
    let shell_command = if let Some(shell) = _shell {
        vec![shell]
    } else {
        // Smart shell detection: try fish, then zsh, then bash, then sh
        // We use /bin/sh as the entrypoint to execute the detection logic
        let smart_command = "if command -v fish >/dev/null 2>&1; then exec fish; elif command -v zsh >/dev/null 2>&1; then exec zsh; elif command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi";
        vec![
            "/bin/sh".to_string(),
            "-c".to_string(),
            smart_command.to_string(),
        ]
    };

    let adapter =
        crate::terminal::PodExecAdapter::new(client, namespace, pod, container_name, shell_command);

    let session_id = state
        .terminal_manager
        .create_session(Box::new(adapter))
        .await?;

    Ok(session_id)
}

/// Open a shell for a local process
#[tauri::command]
pub async fn open_process_shell(
    command: String,
    args: Vec<String>,
    env: std::collections::HashMap<String, String>,
    state: State<'_, AppState>,
) -> Result<String> {
    let adapter = crate::terminal::LocalProcessAdapter::new(command, args, env);
    state
        .terminal_manager
        .create_session(Box::new(adapter))
        .await
}
