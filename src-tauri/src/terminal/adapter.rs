//! Terminal adapter trait and common types

use crate::error::Result;

/// Terminal adapter trait - abstraction for different terminal session types
#[async_trait::async_trait]
pub trait TerminalAdapter: Send + Sync {
    /// Connect to the underlying process/resource
    async fn connect(&mut self) -> Result<()>;

    /// Read output from process (stdout/stderr multiplexed)
    /// Returns None if no data available or process ended
    async fn read_output(&mut self) -> Result<Option<Vec<u8>>>;

    /// Write input to process stdin
    async fn write_input(&mut self, data: &[u8]) -> Result<()>;

    /// Resize terminal (if supported)
    async fn resize(&mut self, cols: u16, rows: u16) -> Result<()>;

    /// Close/terminate the process
    async fn close(&mut self) -> Result<()>;

    /// Check if process is still running
    fn is_running(&self) -> bool;
}
