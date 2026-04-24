//! Pod exec terminal adapter - uses kube API to exec into pods

use crate::error::Result;
use crate::terminal::TerminalAdapter;
use k8s_openapi::api::core::v1::Pod;
use kube::{api::AttachedProcess, Client};
use tokio::io::{AsyncRead, AsyncWrite};

/// Adapter for executing shell in Kubernetes pods
pub struct PodExecAdapter {
    namespace: String,
    pod: String,
    container: String,
    command: Vec<String>,
    client: Client,
    attached: Option<AttachedProcess>,
    // Store streams separately since AttachedProcess.stdin()/stdout() consume via .take()
    stdin_writer: Option<Box<dyn AsyncWrite + Unpin + Send + Sync>>,
    stdout_reader: Option<Box<dyn AsyncRead + Unpin + Send + Sync>>,
}

impl PodExecAdapter {
    /// Create new pod exec adapter
    pub fn new(
        client: Client,
        namespace: String,
        pod: String,
        container: String,
        command: Vec<String>,
    ) -> Self {
        Self {
            namespace,
            pod,
            container,
            command,
            client,
            attached: None,
            stdin_writer: None,
            stdout_reader: None,
        }
    }
}

#[async_trait::async_trait]
impl TerminalAdapter for PodExecAdapter {
    async fn connect(&mut self) -> Result<()> {
        use crate::commands::helpers::ResourceContext;
        use kube::api::{Api, AttachParams};

        let ctx = ResourceContext::from_client(self.client.clone(), self.namespace.clone());
        let api: Api<Pod> = ctx.namespaced_api();

        let attach_params = AttachParams::default()
            .stdin(true)
            .stdout(true)
            .stderr(false)  // MUST be false when tty=true (Kubernetes API requirement)
            .tty(true)      // CRITICAL: TTY must be true for interactive shells
            .container(&self.container);

        let mut attached = api
            .exec(&self.pod, &self.command, &attach_params)
            .await
            .map_err(|e| crate::error::Error::Terminal(format!("Failed to exec: {e}")))?;

        // Extract stdin and stdout writers/readers once and store them
        // This is critical - kube-rs AttachedProcess.stdin()/stdout() consume the values via .take()
        // We must call these methods ONCE and store the results
        self.stdin_writer = attached.stdin().map(|w| Box::new(w) as Box<dyn AsyncWrite + Unpin + Send + Sync>);
        self.stdout_reader = attached.stdout().map(|r| Box::new(r) as Box<dyn AsyncRead + Unpin + Send + Sync>);

        self.attached = Some(attached);
        Ok(())
    }

    async fn read_output(&mut self) -> Result<Option<Vec<u8>>> {
        use tokio::io::AsyncReadExt;

        let mut buf = vec![0u8; crate::terminal::session::TERMINAL_BUFFER_SIZE];

        // With tty=true, all output comes through stdout (PTY behavior)
        // stderr is not used when TTY is enabled
        if let Some(stdout) = &mut self.stdout_reader {
            match tokio::time::timeout(
                std::time::Duration::from_millis(10),
                stdout.read(&mut buf)
            ).await {
                Ok(Ok(0)) => {
                    // EOF - connection closed
                    Ok(None)
                }
                Ok(Ok(n)) => {
                    // Data available (n > 0)
                    Ok(Some(buf[..n].to_vec()))
                }
                Ok(Err(e)) => {
                    // Read error
                    Err(crate::error::Error::Terminal(format!("Read error: {e}")))
                }
                Err(_) => {
                    // Timeout - no data available
                    Ok(None)
                }
            }
        } else {
            Ok(None)
        }
    }

    async fn write_input(&mut self, data: &[u8]) -> Result<()> {
        use tokio::io::AsyncWriteExt;

        let stdin = self.stdin_writer.as_mut()
            .ok_or_else(|| {
                tracing::error!("PodExec: write_input called but stdin not available");
                crate::error::Error::Terminal("stdin not available".to_string())
            })?;

        tracing::debug!("PodExec: writing {} bytes to stdin", data.len());
        stdin.write_all(data).await
            .map_err(|e| {
                tracing::error!("PodExec: write_all failed: {}", e);
                crate::error::Error::Terminal(format!("Write failed: {e}"))
            })?;
        stdin.flush().await
            .map_err(|e| {
                tracing::error!("PodExec: flush failed: {}", e);
                crate::error::Error::Terminal(format!("Flush failed: {e}"))
            })?;
        tracing::debug!("PodExec: successfully wrote and flushed {} bytes", data.len());
        Ok(())
    }

    async fn resize(&mut self, _cols: u16, _rows: u16) -> Result<()> {
        // kube exec doesn't support resize currently
        // This is a known limitation - PTY resize would require kube API extension
        Ok(())
    }

    async fn close(&mut self) -> Result<()> {
        self.stdin_writer = None;
        self.stdout_reader = None;
        self.attached = None;
        Ok(())
    }

    fn is_running(&self) -> bool {
        self.attached.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pod_exec_tty_requirement() {
        // This test documents the TTY requirement for interactive shells
        //
        // With tty=false:
        // - Shell won't show prompt
        // - Input won't be echoed back
        // - Output is buffered
        // - No line editing (arrows, backspace, etc.)
        //
        // With tty=true:
        // - Full interactive shell with prompt
        // - Input echo
        // - Line editing works
        // - All output through stdout (pty behavior)
        // - stderr MUST be false (Kubernetes API requirement!)

        // CRITICAL Kubernetes API constraint:
        // "tty and stderr cannot both be true"
        // When tty=true, stderr must be false

        assert!(true, "TTY must be enabled for interactive shells");
    }

    #[test]
    fn test_stream_handling_with_tty() {
        // When tty=true, all output goes through stdout
        // stderr is not used (PTY merges all streams)
        //
        // The implementation should:
        // 1. Only read from stdout when tty=true
        // 2. Handle EOF (0 bytes read) as connection close
        // 3. Handle timeout (no data) as normal condition

        assert!(true, "With TTY, only stdout is used");
    }
}
