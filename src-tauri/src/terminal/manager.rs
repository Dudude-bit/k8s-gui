use crate::commands::helpers::ResourceContext;
use crate::error::{Error, Result};
use crate::state::AppEvent;
use crate::terminal::session::{TerminalConfig, TerminalInput, TerminalSession, TerminalState, TERMINAL_BUFFER_SIZE};
use dashmap::DashMap;
use k8s_openapi::api::core::v1::Pod;
use kube::{api::Api, Client};
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::broadcast;

/// Terminal manager for handling multiple sessions
pub struct TerminalManager {
    event_tx: broadcast::Sender<AppEvent>,
    sessions: DashMap<String, TerminalSession>,
}

/// Result of non-interactive exec
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

impl TerminalManager {
    /// Create a new terminal manager
    #[must_use]
    pub fn new(event_tx: broadcast::Sender<AppEvent>) -> Self {
        Self {
            event_tx,
            sessions: DashMap::new(),
        }
    }

    /// Create and start a new terminal session
    pub async fn start_session(
        &self,
        client: Client,
        session_id: String,
        config: TerminalConfig,
    ) -> Result<()> {
        let (session, mut input_rx, mut cancel_rx) = TerminalSession::new(session_id.clone(), config.clone());
        
        // Spawn the connection task
        let client = client.clone();
        let event_tx = self.event_tx.clone();
        let session_id_clone = session_id.clone();
        let config_clone = config.clone();
        // We keep a reference to state to update it asynchronously
        {
            let mut state_write = session.state.write().await;
            *state_write = TerminalState::Connecting;
        }
        
        // Update session state logic
        let session_state_updater = session.state.clone();
        
        self.sessions.insert(session_id.clone(), session);

        tokio::spawn(async move {
            let ctx = ResourceContext::from_client(client.clone(), config_clone.namespace.clone());
            let api: Api<Pod> = ctx.namespaced_api();
            let params = config_clone.to_attach_params();

            let attached_res = api
                .exec(&config_clone.pod, &config_clone.command, &params)
                .await;

            let mut attached = match attached_res {
                Ok(a) => {
                    *session_state_updater.write().await = TerminalState::Connected;
                    a
                },
                Err(e) => {
                    tracing::error!("Failed to exec: {}", e);
                    *session_state_updater.write().await = TerminalState::Error;
                     // Notify frontend of error
                     let _ = event_tx.send(AppEvent::TerminalClosed {
                        session_id: session_id_clone.clone(),
                        status: Some(format!("Failed to connect: {e}")),
                    });
                    return;
                }
            };

            // Handle stdout
            if let Some(mut stdout) = attached.stdout() {
                let event_tx = event_tx.clone();
                let session_id = session_id_clone.clone();

                tokio::spawn(async move {
                    let mut buf = vec![0u8; TERMINAL_BUFFER_SIZE];
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

            // Handle stderr
            if let Some(mut stderr) = attached.stderr() {
                let event_tx = event_tx.clone();
                let session_id = session_id_clone.clone();

                tokio::spawn(async move {
                    let mut buf = vec![0u8; TERMINAL_BUFFER_SIZE];
                    loop {
                        match stderr.read(&mut buf).await {
                            Ok(0) => break,
                            Ok(n) => {
                                let data = String::from_utf8_lossy(&buf[..n]).to_string();
                                let _ = event_tx.send(AppEvent::TerminalOutput {
                                    session_id: session_id.clone(),
                                    data,
                                });
                            }
                            Err(e) => {
                                tracing::error!("Stderr read error: {}", e);
                                break;
                            }
                        }
                    }
                });
            }

            let mut close_status = None;

            // Take status early so we can react to process exit while waiting for input.
            let mut status_fut = attached.take_status();

            // Handle stdin
            if let Some(mut stdin) = attached.stdin() {
                loop {
                    tokio::select! {
                        _ = &mut cancel_rx => {
                            tracing::debug!("Terminal session {} cancelled", session_id_clone);
                            break;
                        }
                        input = input_rx.recv() => {
                            match input {
                                Some(TerminalInput::Data(data)) => {
                                    if let Err(e) = stdin.write_all(data.as_bytes()).await {
                                        tracing::error!("Stdin write error: {}", e);
                                        break;
                                    }
                                    if let Err(e) = stdin.flush().await {
                                        tracing::error!("Stdin flush error: {}", e);
                                        break;
                                    }
                                }
                                Some(TerminalInput::Resize { width, height }) => {
                                    tracing::debug!("Resize request: {}x{}", width, height);
                                    // PTY resize logic would go here if/when supported by kube-rs/k8s API
                                }
                                None => {
                                    tracing::debug!("Input channel closed");
                                    break;
                                }
                            }
                        }
                        status = async {
                            if let Some(status_future) = &mut status_fut {
                                status_future.await
                            } else {
                                None
                            }
                        }, if status_fut.is_some() => {
                            if let Some(exit_status) = status {
                                tracing::debug!("Terminal session {} exited: {:?}", session_id_clone, exit_status);
                                if let Some(code) = exit_status.code {
                                    close_status = Some(format!("Exited with code {code}"));
                                }
                            }
                            status_fut = None;
                            break;
                        }
                    }
                }
            }

            // Wait for process to finish if we haven't already
            if let Some(status) = status_fut {
                if let Some(exit_status) = status.await {
                    tracing::debug!("Terminal session {} exited: {:?}", session_id_clone, exit_status);
                    if let Some(code) = exit_status.code {
                        close_status = Some(format!("Exited with code {code}"));
                    }
                }
            }
            
            *session_state_updater.write().await = TerminalState::Disconnected;
            
             let _ = event_tx.send(AppEvent::TerminalClosed {
                session_id: session_id_clone,
                status: close_status,
            });
        });

        Ok(())
    }
    
    /// Get a session by ID
    pub fn get_session(
        &self,
        id: &str,
    ) -> Option<dashmap::mapref::one::Ref<'_, String, TerminalSession>> {
        self.sessions.get(id)
    }
    
    /// Send input to a session
    pub async fn send_input(&self, id: &str, data: &str) -> Result<()> {
        if let Some(session) = self.sessions.get(id) {
            session.send(data).await?;
            Ok(())
        } else {
             Err(Error::Terminal(format!("Session {id} not found")))
        }
    }
    
    /// Resize a session
    pub async fn resize_session(&self, id: &str, width: u16, height: u16) -> Result<()> {
         if let Some(session) = self.sessions.get(id) {
            session.resize(width, height).await?;
            Ok(())
        } else {
             Err(Error::Terminal(format!("Session {id} not found")))
        }
    }

    /// Close a session
    pub fn close_session(&self, id: &str) -> Result<()> {
        if let Some((_, mut session)) = self.sessions.remove(id) {
            session.close();
            Ok(())
        } else {
            // Already closed or not found, just return Ok
            Ok(())
        }
    }

    /// Get number of active sessions
    pub fn session_count(&self) -> usize {
        self.sessions.len()
    }

    /// Execute a command and return output (non-interactive)
    pub async fn exec(&self, client: Client, config: &TerminalConfig) -> Result<ExecResult> {
        let ctx = ResourceContext::from_client(client, config.namespace.clone());
        let api: Api<Pod> = ctx.namespaced_api();

        let params = config.to_attach_params();

        let mut attached = api
            .exec(&config.pod, &config.command, &params)
            .await
            .map_err(|e| Error::Terminal(format!("Failed to exec: {e}")))?;

        let mut stdout_data = Vec::new();
        let mut stderr_data = Vec::new();

        // Read stdout
        if let Some(mut stdout) = attached.stdout() {
            stdout
                .read_to_end(&mut stdout_data)
                .await
                .map_err(|e| Error::Terminal(format!("Failed to read stdout: {e}")))?;
        }

        // Read stderr
        if let Some(mut stderr) = attached.stderr() {
            stderr
                .read_to_end(&mut stderr_data)
                .await
                .map_err(|e| Error::Terminal(format!("Failed to read stderr: {e}")))?;
        }

        // Get exit status
        let exit_code = if let Some(status) = attached.take_status() {
            status.await.and_then(|s| {
                s.status.as_ref().and_then(|status_str| {
                    if status_str == "Success" {
                        Some(0)
                    } else {
                        None
                    }
                })
            })
        } else {
            None
        };

        Ok(ExecResult {
            stdout: String::from_utf8_lossy(&stdout_data).to_string(),
            stderr: String::from_utf8_lossy(&stderr_data).to_string(),
            exit_code,
        })
    }
}
