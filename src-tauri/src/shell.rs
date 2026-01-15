//! Shell command execution with user PATH resolution.

use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
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
        let separator = if cfg!(windows) { ';' } else { ':' };
        tracing::info!(
            "Resolved user PATH from shell ({} entries)",
            path.split(separator).count()
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
    pub(crate) program: OsString,
    pub(crate) args: Vec<OsString>,
    pub(crate) envs: HashMap<String, String>,
    pub(crate) timeout: Duration,
    pub(crate) current_dir: Option<PathBuf>,
}

impl ShellCommand {
    /// Create a new shell command.
    /// Accepts any type that can be converted to OsStr (String, &str, PathBuf, &Path, OsString, etc.)
    pub fn new(program: impl AsRef<OsStr>) -> Self {
        Self {
            program: program.as_ref().to_owned(),
            args: Vec::new(),
            envs: HashMap::new(),
            timeout: Duration::from_secs(30),
            current_dir: None,
        }
    }

    /// Add a single argument.
    pub fn arg(mut self, arg: impl AsRef<OsStr>) -> Self {
        self.args.push(arg.as_ref().to_owned());
        self
    }

    /// Add multiple arguments.
    pub fn args<I, S>(mut self, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        self.args.extend(args.into_iter().map(|s| s.as_ref().to_owned()));
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
    let mut paths: Vec<PathBuf> = Vec::new();

    #[cfg(not(windows))]
    {
        // Homebrew paths (macOS)
        paths.push(PathBuf::from("/opt/homebrew/bin")); // ARM macOS
        paths.push(PathBuf::from("/usr/local/bin"));    // Intel macOS, Linux

        // System paths
        paths.push(PathBuf::from("/usr/bin"));
        paths.push(PathBuf::from("/bin"));
        paths.push(PathBuf::from("/usr/sbin"));
        paths.push(PathBuf::from("/sbin"));

        // Snap (Linux)
        paths.push(PathBuf::from("/snap/bin"));

        // User local paths
        if let Some(home) = dirs::home_dir() {
            paths.push(home.join(".local/bin"));
            paths.push(home.join(".asdf/shims"));
            paths.push(home.join(".cargo/bin"));
        }
    }

    #[cfg(windows)]
    {
        // Windows common paths
        if let Some(home) = dirs::home_dir() {
            paths.push(home.join(".cargo\\bin"));
            paths.push(home.join("scoop\\shims"));
        }
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            paths.push(PathBuf::from(program_files));
        }
    }

    // Include current PATH entries
    if let Ok(current) = std::env::var("PATH") {
        let separator = if cfg!(windows) { ';' } else { ':' };
        for entry in current.split(separator) {
            if !entry.is_empty() {
                paths.push(PathBuf::from(entry));
            }
        }
    }

    // Use std::env::join_paths for OS-specific separator
    std::env::join_paths(&paths)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Timeout for shell PATH resolution to prevent blocking on slow login scripts.
const SHELL_PATH_TIMEOUT: Duration = Duration::from_secs(30);

/// Get PATH from user's login shell.
#[cfg(not(windows))]
async fn get_path_from_shell() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());

    // Use printenv instead of echo $PATH for shell-agnostic behavior.
    // Fish shell outputs PATH as space-separated when using echo $PATH,
    // but printenv PATH works correctly across all shells.
    let output_future = Command::new(&shell)
        .args(["-l", "-c", "printenv PATH"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .stdin(Stdio::null())
        .output();

    // Add timeout to prevent blocking on slow/hanging login scripts
    let output = match tokio::time::timeout(SHELL_PATH_TIMEOUT, output_future).await {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            tracing::warn!("Failed to execute shell for PATH: {}", e);
            return None;
        }
        Err(_) => {
            tracing::warn!(
                "Shell PATH resolution timed out after {:?}, using fallback",
                SHELL_PATH_TIMEOUT
            );
            return None;
        }
    };

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

/// Get PATH on Windows - just return current process PATH.
/// Windows GUI apps typically inherit proper PATH from the system.
#[cfg(windows)]
async fn get_path_from_shell() -> Option<String> {
    std::env::var("PATH").ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(windows))]
    #[test]
    fn test_fallback_path_contains_common_dirs() {
        let path = build_fallback_path();
        assert!(path.contains("/usr/local/bin"), "Missing /usr/local/bin");
        assert!(path.contains("/usr/bin"), "Missing /usr/bin");
    }

    #[cfg(all(target_arch = "aarch64", not(windows)))]
    #[test]
    fn test_fallback_path_contains_homebrew_arm() {
        let path = build_fallback_path();
        assert!(path.contains("/opt/homebrew/bin"), "Missing /opt/homebrew/bin on ARM");
    }

    #[cfg(windows)]
    #[test]
    fn test_fallback_path_contains_windows_paths() {
        let path = build_fallback_path();
        // On Windows, should use semicolon separator and include current PATH
        assert!(path.contains(';') || path.is_empty() || !path.contains(':'),
                "Windows PATH should use semicolon separator");
    }

    #[tokio::test]
    async fn test_get_path_from_shell_returns_something() {
        // This test verifies shell PATH resolution works on the dev machine
        let path = get_path_from_shell().await;
        // Should return Some on most systems, None is acceptable if shell fails
        if let Some(p) = path {
            assert!(!p.is_empty(), "PATH should not be empty");
            let separator = if cfg!(windows) { ';' } else { ':' };
            assert!(p.contains(separator), "PATH should contain multiple entries");
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

        assert_eq!(cmd.program, OsString::from("echo"));
        assert_eq!(cmd.args, vec![OsString::from("hello"), OsString::from("world"), OsString::from("!")]);
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
