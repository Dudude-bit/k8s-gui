use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, RwLock};

/// Default buffer size for terminal I/O operations (4KB)
pub const TERMINAL_BUFFER_SIZE: usize = 4096;

/// Terminal session state
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TerminalState {
    Idle,
    Connecting,
    Connected,
    Disconnected,
    Error,
}

/// Terminal input types
#[derive(Debug)]
pub enum TerminalInput {
    Data(String),
    Resize { width: u16, height: u16 },
}

/// Terminal session handle
pub struct TerminalSession {
    /// Session ID
    pub id: String,
    /// Input sender
    input_tx: mpsc::Sender<TerminalInput>,
    /// State
    pub(crate) state: Arc<RwLock<TerminalState>>,
    /// Cancel signal
    cancel_tx: Option<oneshot::Sender<()>>,
}

impl TerminalSession {
    pub(crate) fn new(
        id: String,
    ) -> (Self, mpsc::Receiver<TerminalInput>, oneshot::Receiver<()>) {
        let (input_tx, input_rx) = mpsc::channel(100);
        let (cancel_tx, cancel_rx) = oneshot::channel();
        let state = Arc::new(RwLock::new(TerminalState::Idle));

        let session = Self {
            id,
            input_tx,
            state,
            cancel_tx: Some(cancel_tx),
        };

        (session, input_rx, cancel_rx)
    }

    /// Get current state
    pub async fn state(&self) -> TerminalState {
        self.state.read().await.clone()
    }

    /// Set state
    pub async fn set_state(&self, new_state: TerminalState) {
        *self.state.write().await = new_state;
    }

    /// Send data to terminal
    pub async fn send(&self, data: &str) -> Result<()> {
        self.input_tx
            .send(TerminalInput::Data(data.to_string()))
            .await
            .map_err(|e| Error::Terminal(format!("Failed to send: {e}")))
    }

    /// Resize terminal
    pub async fn resize(&self, width: u16, height: u16) -> Result<()> {
        self.input_tx
            .send(TerminalInput::Resize { width, height })
            .await
            .map_err(|e| Error::Terminal(format!("Failed to resize: {e}")))
    }

    /// Close the session
    pub fn close(&mut self) {
        if let Some(tx) = self.cancel_tx.take() {
            let _ = tx.send(());
        }
    }
}
