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

    /// Release the subscribe gate for a session, signalling that the
    /// frontend has registered its `terminal-output` / `terminal-closed`
    /// listeners and is ready to receive events. Idempotent.
    ///
    /// Returns an error only if the session ID is unknown — callers can
    /// surface that to the frontend so a malicious caller cannot release
    /// arbitrary IDs without a registered session.
    pub fn mark_subscribed(&self, id: &str) -> Result<()> {
        if let Some(mut session) = self.sessions.get_mut(id) {
            session.mark_subscribed();
            Ok(())
        } else {
            Err(Error::Terminal(format!("Session {id} not found")))
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
        let (session, mut input_rx, mut cancel_rx, subscribe_rx) =
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

            // Wait for the frontend to signal it has registered its
            // event listeners. Without this gate, output emitted between
            // session creation and listener registration would be lost
            // forever — Tauri events have no replay. The cancel channel
            // is also armed so a session closed during startup unwinds
            // cleanly. A safety timeout prevents a wedged session if
            // the frontend never calls `terminal_subscribed` (e.g.
            // browser crash).
            tokio::select! {
                _ = subscribe_rx => {}
                _ = &mut cancel_rx => {
                    tracing::debug!(
                        "Terminal session {} cancelled before subscribe",
                        session_id_clone
                    );
                    let _ = adapter.close().await;
                    *session_state.write().await = TerminalState::Disconnected;
                    sessions.remove(&session_id_clone);
                    let _ = event_tx.send(AppEvent::TerminalClosed {
                        session_id: session_id_clone,
                        status: None,
                    });
                    return;
                }
                _ = tokio::time::sleep(tokio::time::Duration::from_secs(60)) => {
                    tracing::warn!(
                        "Terminal session {} subscribe gate timed out after 60s; \
                         starting I/O loop anyway",
                        session_id_clone
                    );
                }
            }

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::terminal::TerminalAdapter;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::time::Duration;

    /// Fake adapter: counts `read_output` calls so the test can assert
    /// the read loop didn't start before the gate was released.
    struct CountingAdapter {
        connected: Arc<AtomicBool>,
        reads: Arc<AtomicUsize>,
        payload: Vec<u8>,
        delivered: Arc<AtomicBool>,
    }

    impl CountingAdapter {
        fn new(payload: &[u8]) -> (Self, Arc<AtomicUsize>, Arc<AtomicBool>) {
            let reads = Arc::new(AtomicUsize::new(0));
            let delivered = Arc::new(AtomicBool::new(false));
            (
                Self {
                    connected: Arc::new(AtomicBool::new(false)),
                    reads: reads.clone(),
                    payload: payload.to_vec(),
                    delivered: delivered.clone(),
                },
                reads,
                delivered,
            )
        }
    }

    #[async_trait::async_trait]
    impl TerminalAdapter for CountingAdapter {
        async fn connect(&mut self) -> Result<()> {
            self.connected.store(true, Ordering::SeqCst);
            Ok(())
        }

        async fn read_output(&mut self) -> Result<Option<Vec<u8>>> {
            self.reads.fetch_add(1, Ordering::SeqCst);
            if self.delivered.swap(true, Ordering::SeqCst) {
                Ok(None)
            } else {
                Ok(Some(self.payload.clone()))
            }
        }

        async fn write_input(&mut self, _data: &[u8]) -> Result<()> {
            Ok(())
        }

        async fn resize(&mut self, _cols: u16, _rows: u16) -> Result<()> {
            Ok(())
        }

        async fn close(&mut self) -> Result<()> {
            self.connected.store(false, Ordering::SeqCst);
            Ok(())
        }

        fn is_running(&self) -> bool {
            self.connected.load(Ordering::SeqCst)
        }
    }

    #[tokio::test]
    async fn read_output_is_not_called_before_subscribe() {
        let (event_tx, _event_rx) = broadcast::channel(64);
        let manager = TerminalManager::new(event_tx);
        let (adapter, reads, _delivered) = CountingAdapter::new(b"hello");

        let _session_id = manager
            .create_session(Box::new(adapter))
            .await
            .expect("create_session");

        // Give the spawned task plenty of time to run connect() and
        // (incorrectly) start reading. The 50ms read tick * 6 = 300ms
        // is more than enough for any leakage to surface.
        tokio::time::sleep(Duration::from_millis(300)).await;

        assert_eq!(
            reads.load(Ordering::SeqCst),
            0,
            "read_output must not be called before mark_subscribed"
        );
    }

    #[tokio::test]
    async fn output_is_broadcast_after_subscribe() {
        let (event_tx, mut event_rx) = broadcast::channel(64);
        let manager = TerminalManager::new(event_tx);
        let (adapter, _reads, _delivered) = CountingAdapter::new(b"hello");

        let session_id = manager
            .create_session(Box::new(adapter))
            .await
            .expect("create_session");

        // Confirm the gate is holding (no events while we wait).
        let early = tokio::time::timeout(Duration::from_millis(150), event_rx.recv()).await;
        assert!(
            early.is_err(),
            "no events should be emitted before subscribe; got {early:?}"
        );

        // Release the gate.
        manager
            .mark_subscribed(&session_id)
            .expect("mark_subscribed");

        // Now we expect a TerminalOutput within a couple of read ticks.
        let event = tokio::time::timeout(Duration::from_millis(500), event_rx.recv())
            .await
            .expect("event within timeout")
            .expect("event delivered");

        match event {
            AppEvent::TerminalOutput {
                session_id: sid,
                data,
            } => {
                assert_eq!(sid, session_id);
                assert_eq!(data, "hello");
            }
            other => panic!("expected TerminalOutput, got {other:?}"),
        }
    }

    #[test]
    fn mark_subscribed_unknown_session_errors() {
        let (event_tx, _event_rx) = broadcast::channel(8);
        let manager = TerminalManager::new(event_tx);

        let err = manager.mark_subscribed("not-a-real-id").unwrap_err();
        assert!(
            matches!(err, Error::Terminal(_)),
            "unknown session must return Error::Terminal, got {err:?}"
        );
    }
}
