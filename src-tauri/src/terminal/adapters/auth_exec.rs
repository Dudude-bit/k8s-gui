//! Auth exec process adapter - for kubectl exec auth with separate stdout collection

use crate::error::Result;
use crate::terminal::TerminalAdapter;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};
use tokio::sync::RwLock;

/// Maximum stdout size to collect (1MB) - prevents OOM from malicious/buggy auth commands
const MAX_STDOUT_SIZE: usize = 1024 * 1024;

/// Adapter for auth exec processes
/// This adapter separates stdout (for JSON parsing) from stderr (for terminal display)
pub struct AuthExecAdapter {
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    stdout: Option<ChildStdout>,
    stderr: Option<ChildStderr>,
    /// Collected stdout for JSON parsing
    collected_stdout: Arc<RwLock<Vec<u8>>>,
}

impl AuthExecAdapter {
    /// Create new auth exec adapter
    pub fn new(command: String, args: Vec<String>, env: HashMap<String, String>) -> Self {
        Self {
            command,
            args,
            env,
            child: None,
            stdin: None,
            stdout: None,
            stderr: None,
            collected_stdout: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Get collected stdout (for JSON parsing after process completes)
    pub fn collected_stdout(&self) -> Arc<RwLock<Vec<u8>>> {
        self.collected_stdout.clone()
    }
}

#[async_trait::async_trait]
impl TerminalAdapter for AuthExecAdapter {
    async fn connect(&mut self) -> Result<()> {
        let mut cmd = Command::new(&self.command);
        cmd.args(&self.args)
            .envs(&self.env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let mut child = cmd.spawn().map_err(|e| {
            crate::error::Error::Terminal(format!("Failed to spawn auth process: {e}"))
        })?;

        self.stdin = child.stdin.take();
        self.stdout = child.stdout.take();
        self.stderr = child.stderr.take();
        self.child = Some(child);

        Ok(())
    }

    async fn read_output(&mut self) -> Result<Option<Vec<u8>>> {
        use tokio::io::AsyncReadExt;

        let mut buf = vec![0u8; crate::terminal::session::TERMINAL_BUFFER_SIZE];

        // Try reading from stdout - collect it but don't return to terminal
        if let Some(stdout) = &mut self.stdout {
            match tokio::time::timeout(std::time::Duration::from_millis(10), stdout.read(&mut buf))
                .await
            {
                Ok(Ok(n)) if n > 0 => {
                    // Collect stdout for JSON parsing (with size limit to prevent OOM)
                    let data = buf[..n].to_vec();
                    let mut collected = self.collected_stdout.write().await;

                    // Only collect up to MAX_STDOUT_SIZE to prevent memory exhaustion
                    if collected.len() + data.len() <= MAX_STDOUT_SIZE {
                        collected.extend_from_slice(&data);
                    } else if collected.len() < MAX_STDOUT_SIZE {
                        // Partial append to reach limit
                        let remaining = MAX_STDOUT_SIZE - collected.len();
                        collected.extend_from_slice(&data[..remaining]);
                    }
                    // Don't return stdout to terminal - only stderr should be shown
                }
                _ => {}
            }
        }

        // Try reading from stderr - this goes to terminal
        if let Some(stderr) = &mut self.stderr {
            match tokio::time::timeout(std::time::Duration::from_millis(10), stderr.read(&mut buf))
                .await
            {
                Ok(Ok(n)) if n > 0 => {
                    return Ok(Some(buf[..n].to_vec()));
                }
                _ => {}
            }
        }

        Ok(None)
    }

    async fn write_input(&mut self, data: &[u8]) -> Result<()> {
        use tokio::io::AsyncWriteExt;

        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| crate::error::Error::Terminal("No stdin available".to_string()))?;

        stdin
            .write_all(data)
            .await
            .map_err(|e| crate::error::Error::Terminal(format!("Write failed: {e}")))?;
        stdin
            .flush()
            .await
            .map_err(|e| crate::error::Error::Terminal(format!("Flush failed: {e}")))?;

        Ok(())
    }

    async fn resize(&mut self, _cols: u16, _rows: u16) -> Result<()> {
        // No-op for local processes (no PTY support)
        Ok(())
    }

    async fn close(&mut self) -> Result<()> {
        if let Some(mut child) = self.child.take() {
            // Close stdin first to signal process to exit
            self.stdin = None;

            // Try graceful shutdown with timeout
            match tokio::time::timeout(std::time::Duration::from_secs(2), child.wait()).await {
                Ok(Ok(_)) => {}
                _ => {
                    // Force kill if timeout
                    let _ = child.kill().await;
                }
            }
        }

        self.stdout = None;
        self.stderr = None;
        Ok(())
    }

    fn is_running(&self) -> bool {
        self.child.is_some()
    }
}
