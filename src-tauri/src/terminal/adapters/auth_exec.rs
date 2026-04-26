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

        // Read from stdout: tee into the JSON collector AND return
        // to the terminal. Some OIDC drivers (kubelogin, kubectl-oidc_login
        // depending on grant type) write the "open this URL" prompt to
        // stdout — silently dropping it leaves the auth modal blank.
        // The terminal is the user's display surface; the collector is
        // a separate concern for ExecCredential JSON parsing.
        if let Some(stdout) = &mut self.stdout {
            if let Ok(Ok(n)) =
                tokio::time::timeout(std::time::Duration::from_millis(10), stdout.read(&mut buf))
                    .await
            {
                if n > 0 {
                    let data = buf[..n].to_vec();

                    // Append to JSON collector with size cap (terminal
                    // stream itself is bounded by xterm scrollback).
                    {
                        let mut collected = self.collected_stdout.write().await;
                        if collected.len() + data.len() <= MAX_STDOUT_SIZE {
                            collected.extend_from_slice(&data);
                        } else if collected.len() < MAX_STDOUT_SIZE {
                            let remaining = MAX_STDOUT_SIZE - collected.len();
                            collected.extend_from_slice(&data[..remaining]);
                        }
                    }

                    return Ok(Some(data));
                }
            }
        }

        // Try reading from stderr - this goes to terminal
        if let Some(stderr) = &mut self.stderr {
            if let Ok(Ok(n)) =
                tokio::time::timeout(std::time::Duration::from_millis(10), stderr.read(&mut buf))
                    .await
            {
                if n > 0 {
                    return Ok(Some(buf[..n].to_vec()));
                }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    /// Drain `read_output` into a single buffer until either the
    /// process stops emitting for `quiet_for`, or `total_timeout`
    /// elapses. Use to assert what the terminal would see.
    async fn drain(adapter: &mut AuthExecAdapter, total_timeout: Duration) -> Vec<u8> {
        let mut out = Vec::new();
        let deadline = tokio::time::Instant::now() + total_timeout;
        let mut idle_ticks = 0;
        while tokio::time::Instant::now() < deadline {
            match adapter.read_output().await {
                Ok(Some(chunk)) => {
                    out.extend_from_slice(&chunk);
                    idle_ticks = 0;
                }
                Ok(None) => {
                    idle_ticks += 1;
                    if idle_ticks > 5 && !adapter.is_running() {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(20)).await;
                }
                Err(_) => break,
            }
        }
        out
    }

    #[tokio::test]
    async fn read_output_returns_stdout_to_terminal() {
        // Many OIDC drivers (kubelogin --grant-type=authcode-keyboard,
        // some `kubectl-oidc_login` builds) write the "open this URL"
        // prompt to stdout, not stderr. Previously this adapter
        // silently swallowed stdout, so the user saw an empty modal
        // even after the race fix.
        let mut adapter = AuthExecAdapter::new(
            "/bin/sh".into(),
            vec!["-c".into(), "printf STDOUT_PROMPT".into()],
            HashMap::new(),
        );

        adapter.connect().await.expect("spawn");
        let drained = drain(&mut adapter, Duration::from_secs(2)).await;
        adapter.close().await.expect("close");

        let text = String::from_utf8_lossy(&drained);
        assert!(
            text.contains("STDOUT_PROMPT"),
            "stdout was not delivered to terminal; got {text:?}"
        );
    }

    #[tokio::test]
    async fn read_output_still_returns_stderr() {
        let mut adapter = AuthExecAdapter::new(
            "/bin/sh".into(),
            vec!["-c".into(), "printf STDERR_LINE 1>&2".into()],
            HashMap::new(),
        );

        adapter.connect().await.expect("spawn");
        let drained = drain(&mut adapter, Duration::from_secs(2)).await;
        adapter.close().await.expect("close");

        let text = String::from_utf8_lossy(&drained);
        assert!(
            text.contains("STDERR_LINE"),
            "stderr regressed; got {text:?}"
        );
    }

    #[tokio::test]
    async fn collected_stdout_still_captures_json_payload() {
        // The auth flow downstream parses JSON ExecCredential from
        // `collected_stdout()`. Tee'ing stdout to the terminal must
        // NOT break that parsing path.
        let mut adapter = AuthExecAdapter::new(
            "/bin/sh".into(),
            vec!["-c".into(), "printf '{\"kind\":\"ExecCredential\"}'".into()],
            HashMap::new(),
        );
        let collected_handle = adapter.collected_stdout();

        adapter.connect().await.expect("spawn");
        let _ = drain(&mut adapter, Duration::from_secs(2)).await;
        adapter.close().await.expect("close");

        let collected = collected_handle.read().await;
        let text = String::from_utf8_lossy(&collected);
        assert!(
            text.contains("\"kind\":\"ExecCredential\""),
            "collected_stdout lost the JSON payload; got {text:?}"
        );
    }
}
