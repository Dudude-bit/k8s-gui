//! Terminal/Exec commands

use crate::state::AppState;
use serde::{Deserialize, Serialize};
use crate::state::AppEvent;
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

/// Exec command result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

/// Copy operation result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyResult {
    pub success: bool,
    pub bytes_copied: Option<u64>,
    pub error: Option<String>,
}

/// Send input to terminal session
#[tauri::command]
pub async fn terminal_input(
    session_id: String,
    data: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if let Some(input_tx) = state.terminal_inputs.get(&session_id) {
        input_tx.send(data).await.map_err(|e| format!("Failed to send input: {}", e))?;
    } else {
        tracing::warn!("No input channel found for session {}", session_id);
    }
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
    // Note: Terminal resize requires PTY (pseudo-terminal) support.
    // Currently, terminal sessions use exec attach which doesn't support resize.
    // When PTY support is added, this will send SIGWINCH signal or use resize API.
    tracing::debug!("Terminal resize requested for session {}: {}x{} (PTY resize not yet implemented)", session_id, cols, rows);
    Ok(())
}

/// Close terminal session
#[tauri::command]
pub async fn close_terminal(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Remove input channel (this will cause the stdin writer task to exit)
    state.terminal_inputs.remove(&session_id);
    
    // Remove session info
    state.terminal_sessions.remove(&session_id);
    
    tracing::info!("Terminal session {} closed", session_id);
    Ok(())
}

/// Open a shell in a pod
#[tauri::command]
pub async fn open_shell(
    namespace: String,
    pod: String,
    container: Option<String>,
    shell: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    use kube::api::AttachParams;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use crate::state::AppEvent;
    
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
    
    let shell_cmd = shell.unwrap_or_else(|| "/bin/sh".to_string());
    let session_id = format!("shell-{}-{}-{}", namespace, pod, uuid::Uuid::new_v4());
    
    let params = AttachParams::default()
        .container(&container_name)
        .stdin(true)
        .stdout(true)
        .stderr(false)
        .tty(true);
    
    let mut attached = api.exec(&pod, vec![&shell_cmd], &params)
        .await
        .map_err(|e| format!("Failed to exec into pod: {}", e))?;
    
    let event_tx = state.event_tx.clone();
    let session_id_clone = session_id.clone();

    // Handle stdout
    if let Some(mut stdout) = attached.stdout() {
        let event_tx = event_tx.clone();
        let session_id = session_id_clone.clone();
        
        tokio::spawn(async move {
            let mut buf = vec![0u8; 4096];
            loop {
                match stdout.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = event_tx.send(AppEvent::TerminalOutput {
                            session_id: session_id.clone(),
                            data,
                        });
                    }
                    Err(e) => {
                        tracing::error!("Stdout read error: {}", e);
                        break;
                    }
                }
            }
        });
    }
    
    // Store stdin for later input
    let stdin = attached.stdin();
    if let Some(stdin_writer) = stdin {
        let (input_tx, mut input_rx) = tokio::sync::mpsc::channel::<String>(100);
        
        // Store the input channel
        state.terminal_inputs.insert(session_id.clone(), input_tx);
        
        // Spawn task to handle stdin
        tokio::spawn(async move {
            let mut stdin_writer = stdin_writer;
            while let Some(data) = input_rx.recv().await {
                if let Err(e) = stdin_writer.write_all(data.as_bytes()).await {
                    tracing::error!("Failed to write to stdin: {}", e);
                    break;
                }
                let _ = stdin_writer.flush().await;
            }
        });
    }
    
    // Store session info
    let terminal_session = crate::state::TerminalSession {
        id: session_id.clone(),
        pod: pod.clone(),
        container: container_name,
        namespace: namespace.clone(),
        created_at: chrono::Utc::now(),
    };
    state.terminal_sessions.insert(session_id.clone(), terminal_session);

    // Watch for session close
    let terminal_inputs = state.terminal_inputs.clone();
    let terminal_sessions = state.terminal_sessions.clone();
    let close_event_tx = state.event_tx.clone();
    let session_id_for_close = session_id.clone();
    if let Some(status_future) = attached.take_status() {
        tokio::spawn(async move {
            let status_text = status_future
                .await
                .and_then(|status| status.status);

            terminal_inputs.remove(&session_id_for_close);
            terminal_sessions.remove(&session_id_for_close);

            let _ = close_event_tx.send(AppEvent::TerminalClosed {
                session_id: session_id_for_close,
                status: status_text,
            });
        });
    }
    
    Ok(session_id)
}

