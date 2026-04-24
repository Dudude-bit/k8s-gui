//! Local process terminal adapter - spawns local commands with piped I/O

use crate::error::Result;
use crate::terminal::TerminalAdapter;
use std::collections::HashMap;
use std::process::Stdio;
use tokio::process::{Child, ChildStdin, ChildStdout, ChildStderr, Command};

/// Adapter for local process execution
pub struct LocalProcessAdapter {
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    stdout: Option<ChildStdout>,
    stderr: Option<ChildStderr>,
}

impl LocalProcessAdapter {
    /// Create new local process adapter
    pub fn new(
        command: String,
        args: Vec<String>,
        env: HashMap<String, String>,
    ) -> Self {
        Self {
            command,
            args,
            env,
            child: None,
            stdin: None,
            stdout: None,
            stderr: None,
        }
    }
}

#[async_trait::async_trait]
impl TerminalAdapter for LocalProcessAdapter {
    async fn connect(&mut self) -> Result<()> {
        let mut cmd = Command::new(&self.command);
        cmd.args(&self.args)
            .envs(&self.env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let mut child = cmd.spawn()
            .map_err(|e| crate::error::Error::Terminal(format!("Failed to spawn process: {e}")))?;

        self.stdin = child.stdin.take();
        self.stdout = child.stdout.take();
        self.stderr = child.stderr.take();
        self.child = Some(child);

        Ok(())
    }

    async fn read_output(&mut self) -> Result<Option<Vec<u8>>> {
        use tokio::io::AsyncReadExt;

        let mut buf = vec![0u8; crate::terminal::session::TERMINAL_BUFFER_SIZE];

        // Try reading from stdout
        if let Some(stdout) = &mut self.stdout {
            match tokio::time::timeout(
                std::time::Duration::from_millis(10),
                stdout.read(&mut buf)
            ).await {
                Ok(Ok(n)) if n > 0 => {
                    return Ok(Some(buf[..n].to_vec()));
                }
                _ => {}
            }
        }

        // Try reading from stderr
        if let Some(stderr) = &mut self.stderr {
            match tokio::time::timeout(
                std::time::Duration::from_millis(10),
                stderr.read(&mut buf)
            ).await {
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

        let stdin = self.stdin.as_mut()
            .ok_or_else(|| crate::error::Error::Terminal("No stdin available".to_string()))?;

        stdin.write_all(data).await
            .map_err(|e| crate::error::Error::Terminal(format!("Write failed: {e}")))?;
        stdin.flush().await
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
            match tokio::time::timeout(
                std::time::Duration::from_secs(2),
                child.wait()
            ).await {
                Ok(Ok(_)) => {},
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
        // Simple check - if child exists, assume running
        // Actual status will be detected when read_output returns 0 or error
        self.child.is_some()
    }
}
