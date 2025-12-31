//! Terminal module for exec/shell access
//!
//! Provides interactive terminal sessions inside Kubernetes containers.

use crate::commands::helpers::ResourceContext;
use crate::error::{Error, Result};
use crate::state::AppEvent;
use k8s_openapi::api::core::v1::Pod;
use kube::{
    api::{Api, AttachParams},
    Client,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{broadcast, mpsc, oneshot, RwLock};

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
    /// Create a new terminal config with shell
    #[must_use]
    pub fn shell(pod: &str, namespace: &str) -> Self {
        Self {
            pod: pod.to_string(),
            namespace: namespace.to_string(),
            command: vec!["/bin/sh".to_string()],
            ..Default::default()
        }
    }

    /// Create a new terminal config with bash
    #[must_use]
    pub fn bash(pod: &str, namespace: &str) -> Self {
        Self {
            pod: pod.to_string(),
            namespace: namespace.to_string(),
            command: vec!["/bin/bash".to_string()],
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

/// Terminal session handle
pub struct TerminalSession {
    /// Session ID
    pub id: String,
    /// Configuration
    pub config: TerminalConfig,
    /// Input sender
    input_tx: mpsc::Sender<TerminalInput>,
    /// State
    state: Arc<RwLock<TerminalState>>,
    /// Cancel signal
    cancel_tx: Option<oneshot::Sender<()>>,
}

/// Terminal input types
#[derive(Debug)]
pub enum TerminalInput {
    Data(String),
    Resize { width: u16, height: u16 },
}

impl TerminalSession {
    /// Get current state
    pub async fn state(&self) -> TerminalState {
        self.state.read().await.clone()
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
    pub fn close(mut self) {
        if let Some(tx) = self.cancel_tx.take() {
            let _ = tx.send(());
        }
    }
}

/// Terminal manager for handling multiple sessions
pub struct TerminalManager {
    client: Arc<Client>,
    event_tx: broadcast::Sender<AppEvent>,
}

impl TerminalManager {
    /// Create a new terminal manager
    #[must_use]
    pub fn new(client: Arc<Client>, event_tx: broadcast::Sender<AppEvent>) -> Self {
        Self { client, event_tx }
    }

    /// Create a new terminal session
    pub async fn create_session(
        &self,
        session_id: String,
        config: TerminalConfig,
    ) -> Result<(TerminalSession, mpsc::Receiver<TerminalInput>)> {
        let (input_tx, input_rx) = mpsc::channel(100);
        let (cancel_tx, _cancel_rx) = oneshot::channel();
        let state = Arc::new(RwLock::new(TerminalState::Connecting));

        let session = TerminalSession {
            id: session_id,
            config,
            input_tx,
            state,
            cancel_tx: Some(cancel_tx),
        };

        Ok((session, input_rx))
    }

    /// Start terminal session
    pub async fn start_session(
        &self,
        session_id: String,
        config: TerminalConfig,
        mut input_rx: mpsc::Receiver<TerminalInput>,
        mut cancel_rx: oneshot::Receiver<()>,
    ) -> Result<()> {
        let ctx = ResourceContext::from_client((*self.client).clone(), config.namespace.clone());
        let api: Api<Pod> = ctx.namespaced_api();
        let params = config.to_attach_params();

        let mut attached = api
            .exec(&config.pod, &config.command, &params)
            .await
            .map_err(|e| Error::Terminal(format!("Failed to exec: {e}")))?;

        let event_tx = self.event_tx.clone();
        let session_id_clone = session_id.clone();

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

        // Handle stdin
        if let Some(mut stdin) = attached.stdin() {
            loop {
                tokio::select! {
                    _ = &mut cancel_rx => {
                        tracing::debug!("Terminal session {} cancelled", session_id);
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
                                // Terminal resize is handled through the terminal protocol
                                // For TTY sessions, this would send a SIGWINCH or similar
                                tracing::debug!("Resize request: {}x{}", width, height);
                            }
                            None => {
                                tracing::debug!("Input channel closed");
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Wait for process to finish
        let status = attached.take_status();
        if let Some(status) = status {
            if let Some(exit_status) = status.await {
                tracing::debug!("Terminal session {} exited: {:?}", session_id, exit_status);
            }
        }

        Ok(())
    }

    /// Execute a command and return output (non-interactive)
    pub async fn exec(&self, config: &TerminalConfig) -> Result<ExecResult> {
        let ctx = ResourceContext::from_client((*self.client).clone(), config.namespace.clone());
        let api: Api<Pod> = ctx.namespaced_api();

        let params = AttachParams {
            stdin: false,
            stdout: true,
            stderr: true,
            tty: false,
            container: config.container.clone(),
            ..Default::default()
        };

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

/// Result of non-interactive exec
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

/// Terminal resize request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResizeRequest {
    pub session_id: String,
    pub width: u16,
    pub height: u16,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_terminal_config_default() {
        let config = TerminalConfig::default();
        assert!(config.tty);
        assert!(config.stdin);
        assert_eq!(config.command, vec!["/bin/sh"]);
    }

    #[test]
    fn test_terminal_config_shell() {
        let config = TerminalConfig::shell("my-pod", "default");
        assert_eq!(config.pod, "my-pod");
        assert_eq!(config.namespace, "default");
        assert_eq!(config.command, vec!["/bin/sh"]);
    }

    #[test]
    fn test_terminal_config_bash() {
        let config = TerminalConfig::bash("my-pod", "default");
        assert_eq!(config.command, vec!["/bin/bash"]);
    }

    #[test]
    fn test_terminal_config_exec() {
        let config = TerminalConfig::exec(
            "my-pod",
            "default",
            vec!["ls".to_string(), "-la".to_string()],
        );
        assert_eq!(config.command, vec!["ls", "-la"]);
        assert!(!config.tty);
    }
}
