use crate::error::{Error, Result};
use kube::api::AttachParams;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, RwLock};

/// Default buffer size for terminal I/O operations (4KB)
pub const TERMINAL_BUFFER_SIZE: usize = 4096;

/// Terminal session configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalConfig {
    /// Pod name
    pub pod: String,
    /// Container name (optional)
    pub container: Option<String>,
    /// Namespace
    pub namespace: String,
    /// Command to execute
    pub command: Vec<String>,
    /// Enable TTY
    #[serde(default = "default_tty")]
    pub tty: bool,
    /// Enable stdin
    #[serde(default = "default_stdin")]
    pub stdin: bool,
    /// Enable stdout
    #[serde(default = "default_stdout")]
    pub stdout: bool,
    /// Enable stderr
    #[serde(default = "default_stderr")]
    pub stderr: bool,
    /// Terminal width
    #[serde(default = "default_width")]
    pub width: u16,
    /// Terminal height
    #[serde(default = "default_height")]
    pub height: u16,
}

fn default_tty() -> bool {
    true
}
fn default_stdin() -> bool {
    true
}
fn default_stdout() -> bool {
    true
}
fn default_stderr() -> bool {
    true
}
fn default_width() -> u16 {
    80
}
fn default_height() -> u16 {
    24
}

impl Default for TerminalConfig {
    fn default() -> Self {
        Self {
            pod: String::new(),
            container: None,
            namespace: "default".to_string(),
            command: vec!["/bin/sh".to_string()],
            tty: true,
            stdin: true,
            stdout: true,
            stderr: true,
            width: 80,
            height: 24,
        }
    }
}

impl TerminalConfig {
    /// Create a new terminal config with smart shell detection
    #[must_use]
    pub fn smart_default(pod: &str, namespace: &str) -> Self {
        // Smart shell detection: try fish, then zsh, then bash, then sh
        // We use /bin/sh as the entrypoint to execute the detection logic
        let smart_command = "if command -v fish >/dev/null 2>&1; then exec fish; elif command -v zsh >/dev/null 2>&1; then exec zsh; elif command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi";
        
        Self {
            pod: pod.to_string(),
            namespace: namespace.to_string(),
            command: vec!["/bin/sh".to_string(), "-c".to_string(), smart_command.to_string()],
            ..Default::default()
        }
    }

    /// Create exec config for a specific command
    #[must_use]
    pub fn exec(pod: &str, namespace: &str, command: Vec<String>) -> Self {
        Self {
            pod: pod.to_string(),
            namespace: namespace.to_string(),
            command,
            tty: false,
            ..Default::default()
        }
    }

    /// Set container
    #[must_use]
    pub fn with_container(mut self, container: &str) -> Self {
        self.container = Some(container.to_string());
        self
    }

    /// Set terminal size
    #[must_use]
    pub fn with_size(mut self, width: u16, height: u16) -> Self {
        self.width = width;
        self.height = height;
        self
    }

    /// Convert to kube `AttachParams`
    #[must_use]
    pub fn to_attach_params(&self) -> AttachParams {
        let mut params = AttachParams::default();

        if let Some(container) = &self.container {
            params = params.container(container);
        }

        let mut params = params
            .stdin(self.stdin)
            .stdout(self.stdout)
            .stderr(self.stderr)
            .tty(self.tty);

        // Kubernetes rejects tty=true with stderr=true; stderr is merged into stdout for TTY sessions.
        if self.tty {
            params = params.stderr(false);
        }

        params
    }
}

/// Terminal session state
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TerminalState {
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
    /// Configuration
    pub config: TerminalConfig,
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
        config: TerminalConfig,
    ) -> (Self, mpsc::Receiver<TerminalInput>, oneshot::Receiver<()>) {
        let (input_tx, input_rx) = mpsc::channel(100);
        let (cancel_tx, cancel_rx) = oneshot::channel();
        let state = Arc::new(RwLock::new(TerminalState::Connecting));

        let session = Self {
            id,
            config,
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
