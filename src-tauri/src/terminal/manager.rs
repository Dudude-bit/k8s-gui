use crate::error::{Error, Result};
use crate::state::AppEvent;
use crate::terminal::session::{TerminalInput, TerminalSession, TerminalState};
use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::broadcast;

/// Terminal manager for handling multiple sessions
pub struct TerminalManager {
    event_tx: broadcast::Sender<AppEvent>,
    sessions: Arc<DashMap<String, TerminalSession>>,
}

impl TerminalManager {
    /// Create a new terminal manager
    #[must_use]
    pub fn new(event_tx: broadcast::Sender<AppEvent>) -> Self {
        Self {
            event_tx,
            sessions: Arc::new(DashMap::new()),
        }
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

    /// Create a new terminal session with the given adapter
    ///
    /// This is the only public method for creating sessions - it's completely generic
    /// and doesn't know about pods, processes, or any specific session types.
    /// The caller is responsible for creating the appropriate adapter.
    ///
    /// Returns the session_id for tracking.
    pub async fn create_session(
        &self,
        mut adapter: Box<dyn crate::terminal::TerminalAdapter>,
    ) -> Result<String> {
        let session_id = uuid::Uuid::new_v4().to_string();
        let (session, mut input_rx, mut cancel_rx) =
            TerminalSession::new(session_id.clone());

        let event_tx = self.event_tx.clone();
        let session_state = session.state.clone();

        // Update state to connecting
        {
            let mut state = session_state.write().await;
            *state = TerminalState::Connecting;
        }

        self.sessions.insert(session_id.clone(), session);

        let session_id_clone = session_id.clone();
        let sessions = self.sessions.clone();

        // Spawn task with adapter ownership
        tokio::spawn(async move {
            // Connect adapter
            if let Err(e) = adapter.connect().await {
                tracing::error!("Failed to connect adapter: {}", e);
                *session_state.write().await = TerminalState::Error;

                // Remove session from map to prevent memory leak
                sessions.remove(&session_id_clone);

                let _ = event_tx.send(AppEvent::TerminalClosed {
                    session_id: session_id_clone.clone(),
                    status: Some(format!("Failed to connect: {e}")),
                });
                return;
            }

            *session_state.write().await = TerminalState::Connected;

            // I/O loop
            loop {
                tokio::select! {
                    _ = &mut cancel_rx => {
                        tracing::debug!("Terminal session {} cancelled", session_id_clone);
                        break;
                    }
                    input = input_rx.recv() => {
                        match input {
                            Some(TerminalInput::Data(data)) => {
                                if let Err(e) = adapter.write_input(data.as_bytes()).await {
                                    tracing::error!("Failed to write input: {}", e);
                                    break;
                                }
                            }
                            Some(TerminalInput::Resize { width, height }) => {
                                let _ = adapter.resize(width, height).await;
                            }
                            None => {
                                tracing::debug!("Input channel closed");
                                break;
                            }
                        }
                    }
                    _ = tokio::time::sleep(tokio::time::Duration::from_millis(50)) => {
                        // Read output
                        match adapter.read_output().await {
                            Ok(Some(data)) => {
                                let data_str = String::from_utf8_lossy(&data).to_string();
                                let _ = event_tx.send(AppEvent::TerminalOutput {
                                    session_id: session_id_clone.clone(),
                                    data: data_str,
                                });
                            }
                            Ok(None) => {
                                // No data, check if still running
                                if !adapter.is_running() {
                                    break;
                                }
                            }
                            Err(e) => {
                                tracing::error!("Failed to read output: {}", e);
                                break;
                            }
                        }
                    }
                }
            }

            // Cleanup
            let _ = adapter.close().await;
            *session_state.write().await = TerminalState::Disconnected;

            // Remove session from map
            sessions.remove(&session_id_clone);

            let _ = event_tx.send(AppEvent::TerminalClosed {
                session_id: session_id_clone,
                status: None,
            });
        });

        Ok(session_id)
    }
}
