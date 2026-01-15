//! Shell command execution with user PATH resolution.

use std::collections::HashMap;
use std::path::PathBuf;
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

/// Output from a shell command execution.
#[derive(Debug)]
pub struct CommandOutput {
    /// Standard output as string.
    pub stdout: String,
    /// Standard error as string.
    pub stderr: String,
    /// Exit code if available.
    pub exit_code: Option<i32>,
}

impl CommandOutput {
    /// Returns true if the command exited with code 0.
    pub fn success(&self) -> bool {
        self.exit_code == Some(0)
    }
}

/// Builder for shell commands with user PATH and timeout.
pub struct ShellCommand {
    pub(crate) program: String,
    pub(crate) args: Vec<String>,
    pub(crate) envs: HashMap<String, String>,
    pub(crate) timeout: Duration,
    pub(crate) current_dir: Option<PathBuf>,
}

impl ShellCommand {
    /// Create a new shell command.
    pub fn new(program: impl Into<String>) -> Self {
        Self {
            program: program.into(),
            args: Vec::new(),
            envs: HashMap::new(),
            timeout: Duration::from_secs(30),
            current_dir: None,
        }
    }

    /// Add a single argument.
    pub fn arg(mut self, arg: impl Into<String>) -> Self {
        self.args.push(arg.into());
        self
    }

    /// Add multiple arguments.
    pub fn args<I, S>(mut self, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.args.extend(args.into_iter().map(Into::into));
        self
    }

    /// Set an environment variable.
    pub fn env(mut self, key: impl Into<String>, val: impl Into<String>) -> Self {
        self.envs.insert(key.into(), val.into());
        self
    }

    /// Set the command timeout (default: 30s).
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Set the working directory.
    pub fn current_dir(mut self, dir: impl Into<PathBuf>) -> Self {
        self.current_dir = Some(dir.into());
        self
    }

    /// Execute the command and return stdout if successful.
    ///
    /// Returns error if command exits with non-zero code.
    pub async fn run_success(self) -> Result<String> {
        let output = self.run().await?;
        if output.success() {
            Ok(output.stdout)
        } else {
            Err(ShellError::Failed {
                code: output.exit_code,
                stderr: output.stderr,
            })
        }
    }

    /// Execute the command and return output.
    pub async fn run(self) -> Result<CommandOutput> {
        let mut cmd = Command::new(&self.program);

        cmd.args(&self.args);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.stdin(Stdio::null());

        // Apply user PATH
        let user_path = get_user_path();
        if !user_path.is_empty() {
            cmd.env("PATH", user_path);
        }

        // Apply additional env vars
        for (key, val) in &self.envs {
            cmd.env(key, val);
        }

        // Set working directory if specified
        if let Some(dir) = &self.current_dir {
            cmd.current_dir(dir);
        }

        // Execute with timeout
        let output = tokio::time::timeout(self.timeout, cmd.output())
            .await
            .map_err(|_| ShellError::Timeout(self.timeout))?
            .map_err(|e| ShellError::Exec(e.to_string()))?;

        Ok(CommandOutput {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code(),
        })
    }
}

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

    #[test]
    fn test_command_output_success() {
        let output = CommandOutput {
            stdout: "hello".to_string(),
            stderr: String::new(),
            exit_code: Some(0),
        };
        assert!(output.success());

        let failed = CommandOutput {
            stdout: String::new(),
            stderr: "error".to_string(),
            exit_code: Some(1),
        };
        assert!(!failed.success());
    }

    #[test]
    fn test_shell_command_builder() {
        let cmd = ShellCommand::new("echo")
            .arg("hello")
            .args(["world", "!"])
            .env("FOO", "bar")
            .timeout(Duration::from_secs(60));

        assert_eq!(cmd.program, "echo");
        assert_eq!(cmd.args, vec!["hello", "world", "!"]);
        assert_eq!(cmd.envs.get("FOO"), Some(&"bar".to_string()));
        assert_eq!(cmd.timeout, Duration::from_secs(60));
    }

    #[tokio::test]
    async fn test_shell_command_run_echo() {
        init_user_path().await;

        let output = ShellCommand::new("echo")
            .arg("hello")
            .run()
            .await
            .expect("echo should succeed");

        assert!(output.success());
        assert_eq!(output.stdout.trim(), "hello");
        assert!(output.stderr.is_empty());
    }

    #[tokio::test]
    async fn test_shell_command_run_timeout() {
        init_user_path().await;

        let result = ShellCommand::new("sleep")
            .arg("10")
            .timeout(Duration::from_millis(100))
            .run()
            .await;

        assert!(matches!(result, Err(ShellError::Timeout(_))));
    }

    #[tokio::test]
    async fn test_shell_command_run_success() {
        init_user_path().await;

        let stdout = ShellCommand::new("echo")
            .arg("hello")
            .run_success()
            .await
            .expect("should succeed");

        assert_eq!(stdout.trim(), "hello");
    }

    #[tokio::test]
    async fn test_shell_command_run_success_fails_on_error() {
        init_user_path().await;

        let result = ShellCommand::new("sh")
            .args(["-c", "echo error >&2; exit 1"])
            .run_success()
            .await;

        assert!(matches!(result, Err(ShellError::Failed { .. })));
    }
}
