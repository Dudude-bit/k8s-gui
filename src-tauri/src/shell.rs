//! Shell command execution with user PATH resolution.

use std::time::Duration;
use thiserror::Error;

/// Errors that can occur during shell command execution.
#[derive(Debug, Error)]
pub enum ShellError {
    #[error("Command timed out after {0:?}")]
    Timeout(Duration),

    #[error("Failed to execute command: {0}")]
    Exec(String),

    #[error("Command failed with exit code {code:?}: {stderr}")]
    Failed {
        code: Option<i32>,
        stderr: String,
    },
}

pub type Result<T> = std::result::Result<T, ShellError>;

/// Build fallback PATH from known common locations.
fn build_fallback_path() -> String {
    let mut paths: Vec<String> = Vec::new();

    // Homebrew paths
    paths.push("/opt/homebrew/bin".to_string()); // ARM macOS
    paths.push("/usr/local/bin".to_string());    // Intel macOS, Linux

    // System paths
    paths.push("/usr/bin".to_string());
    paths.push("/bin".to_string());
    paths.push("/usr/sbin".to_string());
    paths.push("/sbin".to_string());

    // Snap (Linux)
    paths.push("/snap/bin".to_string());

    // User local paths
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".local/bin").to_string_lossy().to_string());
        paths.push(home.join(".asdf/shims").to_string_lossy().to_string());
        paths.push(home.join(".cargo/bin").to_string_lossy().to_string());
    }

    // Include current PATH as well
    if let Ok(current) = std::env::var("PATH") {
        paths.push(current);
    }

    paths.join(":")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fallback_path_contains_common_dirs() {
        let path = build_fallback_path();
        assert!(path.contains("/usr/local/bin"), "Missing /usr/local/bin");
        assert!(path.contains("/usr/bin"), "Missing /usr/bin");
    }

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn test_fallback_path_contains_homebrew_arm() {
        let path = build_fallback_path();
        assert!(path.contains("/opt/homebrew/bin"), "Missing /opt/homebrew/bin on ARM");
    }
}
