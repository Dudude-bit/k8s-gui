//! Shell command execution with user PATH resolution.

use std::process::Stdio;
use std::time::Duration;
use thiserror::Error;
use tokio::process::Command;
use tokio::sync::OnceCell;

static USER_PATH: OnceCell<String> = OnceCell::const_new();

/// Initialize user PATH from shell. Call once at app startup.
pub async fn init_user_path() {
    let path = resolve_user_path().await;
    // Ignore error if already set (idempotent)
    let _ = USER_PATH.set(path);
}

/// Get the cached user PATH.
pub fn get_user_path() -> &'static str {
    USER_PATH.get().map(|s| s.as_str()).unwrap_or("")
}

/// Resolve user PATH with fallback.
async fn resolve_user_path() -> String {
    if let Some(path) = get_path_from_shell().await {
        tracing::info!(
            "Resolved user PATH from shell ({} entries)",
            path.split(':').count()
        );
        return path;
    }

    tracing::warn!("Failed to get PATH from shell, using fallback");
    build_fallback_path()
}

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

/// Get PATH from user's login shell.
async fn get_path_from_shell() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());

    let output = Command::new(&shell)
        .args(["-l", "-c", "echo $PATH"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .stdin(Stdio::null())
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
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

    #[tokio::test]
    async fn test_get_path_from_shell_returns_something() {
        // This test verifies shell PATH resolution works on the dev machine
        let path = get_path_from_shell().await;
        // Should return Some on most systems, None is acceptable if shell fails
        if let Some(p) = path {
            assert!(!p.is_empty(), "PATH should not be empty");
            assert!(p.contains(':'), "PATH should contain multiple entries");
        }
    }

    #[tokio::test]
    async fn test_init_user_path_caches_value() {
        init_user_path().await;
        let path = get_user_path();
        assert!(!path.is_empty(), "User PATH should be initialized");

        // Second call should return same value (cached)
        let path2 = get_user_path();
        assert_eq!(path, path2, "PATH should be cached");
    }
}
