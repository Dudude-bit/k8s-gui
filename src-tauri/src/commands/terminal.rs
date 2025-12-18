//! Terminal/Exec commands

use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Terminal session info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSessionInfo {
    pub id: String,
    pub pod: String,
    pub container: String,
    pub namespace: String,
    pub created_at: String,
}

/// Exec command result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

/// Copy operation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyResult {
    pub success: bool,
    pub bytes_copied: Option<u64>,
    pub error: Option<String>,
}

/// Exec into a pod (interactive session)
#[tauri::command]
pub async fn exec_in_pod(
    namespace: String,
    pod: String,
    container: Option<String>,
    _command: Option<Vec<String>>,
    _state: State<'_, AppState>,
) -> Result<String, String> {
    // Return a session ID for an interactive session
    // Real implementation would set up WebSocket/PTY
    Ok(format!(
        "session-{}-{}-{}",
        namespace,
        pod,
        container.unwrap_or_else(|| "default".to_string())
    ))
}

/// Send input to terminal session
#[tauri::command]
pub async fn terminal_input(
    session_id: String,
    data: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    // Stub: would send input to PTY
    tracing::debug!("Terminal input for session {}: {} bytes", session_id, data.len());
    Ok(())
}

/// Resize terminal session
#[tauri::command]
pub async fn terminal_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    // Stub: would resize PTY
    tracing::debug!("Terminal resize for session {}: {}x{}", session_id, cols, rows);
    Ok(())
}

/// Close terminal session
#[tauri::command]
pub async fn close_terminal(
    session_id: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    // Stub: would close PTY and cleanup
    tracing::debug!("Closing terminal session: {}", session_id);
    Ok(())
}

/// List active terminal sessions
#[tauri::command]
pub async fn list_terminal_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<TerminalSessionInfo>, String> {
    let sessions: Vec<_> = state.terminal_sessions.iter()
        .map(|r| {
            let s = r.value();
            TerminalSessionInfo {
                id: s.id.clone(),
                pod: s.pod.clone(),
                container: s.container.clone(),
                namespace: s.namespace.clone(),
                created_at: s.created_at.to_rfc3339(),
            }
        })
        .collect();
    Ok(sessions)
}

/// Open a shell in a pod
#[tauri::command]
pub async fn open_shell(
    namespace: String,
    pod: String,
    container: Option<String>,
    shell: Option<String>,
    _state: State<'_, AppState>,
) -> Result<String, String> {
    let _shell_cmd = shell.unwrap_or_else(|| "/bin/sh".to_string());
    // Return a session ID
    Ok(format!(
        "shell-{}-{}-{}",
        namespace,
        pod,
        container.unwrap_or_else(|| "default".to_string())
    ))
}

/// Run a command in a pod (non-interactive)
#[tauri::command]
pub async fn run_command_in_pod(
    namespace: String,
    pod: String,
    container: Option<String>,
    command: Vec<String>,
    state: State<'_, AppState>,
) -> Result<ExecResult, String> {
    use kube::api::AttachParams;
    use tokio::io::AsyncReadExt;
    
    let context = state.get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;
    
    let client = state.client_manager.get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;
    
    let api: kube::Api<k8s_openapi::api::core::v1::Pod> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    
    // Get first container if not specified
    let container_name = if let Some(c) = container {
        c
    } else {
        let pod_obj = api.get(&pod).await.map_err(|e| e.to_string())?;
        pod_obj.spec
            .and_then(|s| s.containers.first().map(|c| c.name.clone()))
            .unwrap_or_else(|| "".to_string())
    };
    
    let params = AttachParams::default()
        .container(&container_name)
        .stdout(true)
        .stderr(true);
    
    let mut attached = api.exec(&pod, command, &params).await.map_err(|e| e.to_string())?;
    
    let mut stdout = String::new();
    let mut stderr = String::new();
    
    if let Some(mut stdout_stream) = attached.stdout() {
        stdout_stream.read_to_string(&mut stdout).await.ok();
    }
    
    if let Some(mut stderr_stream) = attached.stderr() {
        stderr_stream.read_to_string(&mut stderr).await.ok();
    }
    
    let status = attached.take_status();
    let exit_code = if let Some(status_future) = status {
        status_future.await.and_then(|s| s.status).and_then(|s| {
            if s == "Success" { Some(0) } else { Some(1) }
        })
    } else {
        None
    };
    
    Ok(ExecResult {
        stdout,
        stderr,
        exit_code,
    })
}

/// Copy file from pod to local
#[tauri::command]
pub async fn copy_from_pod(
    namespace: String,
    pod: String,
    container: Option<String>,
    remote_path: String,
    local_path: String,
    _state: State<'_, AppState>,
) -> Result<CopyResult, String> {
    // Stub: would use tar to copy file from pod
    tracing::debug!(
        "Copy from pod: {}:{}/{} ({:?}) -> {}",
        namespace, pod, remote_path, container, local_path
    );
    Ok(CopyResult {
        success: false,
        bytes_copied: None,
        error: Some("Copy from pod not yet implemented".to_string()),
    })
}

/// Copy file from local to pod
#[tauri::command]
pub async fn copy_to_pod(
    namespace: String,
    pod: String,
    container: Option<String>,
    local_path: String,
    remote_path: String,
    _state: State<'_, AppState>,
) -> Result<CopyResult, String> {
    // Stub: would use tar to copy file to pod
    tracing::debug!(
        "Copy to pod: {} -> {}:{}/{} ({:?})",
        local_path, namespace, pod, remote_path, container
    );
    Ok(CopyResult {
        success: false,
        bytes_copied: None,
        error: Some("Copy to pod not yet implemented".to_string()),
    })
}
