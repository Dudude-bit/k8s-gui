# ShellCommand Wrapper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a `ShellCommand` wrapper that resolves user PATH from login shell at startup, providing unified API for CLI execution with built-in timeout support.

**Architecture:** New `shell` module with `ShellCommand` builder, `OnceCell`-cached user PATH resolved at app startup, fallback to known paths if shell fails. Refactor existing Command usage to use new wrapper.

**Tech Stack:** Rust, tokio (async), thiserror (errors), OnceCell (caching)

---

## Task 1: Create shell module with error types

**Files:**
- Create: `src-tauri/src/shell.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Create shell.rs with ShellError enum**

```rust
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
```

**Step 2: Add module to lib.rs**

In `src-tauri/src/lib.rs`, add after other `pub mod` declarations:

```rust
pub mod shell;
```

**Step 3: Verify it compiles**

Run: `cargo check`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src-tauri/src/shell.rs src-tauri/src/lib.rs
git commit -m "feat(shell): add shell module with error types"
```

---

## Task 2: Add PATH resolution with fallback

**Files:**
- Modify: `src-tauri/src/shell.rs`

**Step 1: Write test for fallback_path**

Add to `shell.rs`:

```rust
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
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p k8s-gui-lib test_fallback_path`
Expected: FAIL - `build_fallback_path` not found

**Step 3: Implement build_fallback_path**

Add to `shell.rs` before tests:

```rust
use std::path::PathBuf;

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
```

**Step 4: Run test to verify it passes**

Run: `cargo test -p k8s-gui-lib test_fallback_path`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/shell.rs
git commit -m "feat(shell): add fallback PATH builder"
```

---

## Task 3: Add shell PATH resolution

**Files:**
- Modify: `src-tauri/src/shell.rs`

**Step 1: Write test for get_path_from_shell**

Add to tests module:

```rust
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
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p k8s-gui-lib test_get_path_from_shell`
Expected: FAIL - `get_path_from_shell` not found

**Step 3: Implement get_path_from_shell**

Add to `shell.rs`:

```rust
use std::process::Stdio;
use tokio::process::Command;

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
```

**Step 4: Run test to verify it passes**

Run: `cargo test -p k8s-gui-lib test_get_path_from_shell`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/shell.rs
git commit -m "feat(shell): add shell PATH resolution"
```

---

## Task 4: Add OnceCell PATH caching

**Files:**
- Modify: `src-tauri/src/shell.rs`

**Step 1: Write test for init and get**

Add to tests module:

```rust
#[tokio::test]
async fn test_init_user_path_caches_value() {
    init_user_path().await;
    let path = get_user_path();
    assert!(!path.is_empty(), "User PATH should be initialized");

    // Second call should return same value (cached)
    let path2 = get_user_path();
    assert_eq!(path, path2, "PATH should be cached");
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p k8s-gui-lib test_init_user_path`
Expected: FAIL - `init_user_path` not found

**Step 3: Implement OnceCell caching**

Add to `shell.rs` at the top (after use statements):

```rust
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
```

**Step 4: Run test to verify it passes**

Run: `cargo test -p k8s-gui-lib test_init_user_path`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/shell.rs
git commit -m "feat(shell): add OnceCell PATH caching"
```

---

## Task 5: Add CommandOutput struct

**Files:**
- Modify: `src-tauri/src/shell.rs`

**Step 1: Write test for CommandOutput**

Add to tests module:

```rust
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
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p k8s-gui-lib test_command_output_success`
Expected: FAIL - `CommandOutput` not found

**Step 3: Implement CommandOutput**

Add to `shell.rs`:

```rust
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
```

**Step 4: Run test to verify it passes**

Run: `cargo test -p k8s-gui-lib test_command_output_success`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/shell.rs
git commit -m "feat(shell): add CommandOutput struct"
```

---

## Task 6: Add ShellCommand builder

**Files:**
- Modify: `src-tauri/src/shell.rs`

**Step 1: Write test for ShellCommand builder**

Add to tests module:

```rust
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
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p k8s-gui-lib test_shell_command_builder`
Expected: FAIL - `ShellCommand` not found

**Step 3: Implement ShellCommand builder**

Add to `shell.rs`:

```rust
use std::collections::HashMap;

/// Builder for shell commands with user PATH and timeout.
pub struct ShellCommand {
    program: String,
    args: Vec<String>,
    envs: HashMap<String, String>,
    timeout: Duration,
    current_dir: Option<PathBuf>,
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
}
```

**Step 4: Run test to verify it passes**

Run: `cargo test -p k8s-gui-lib test_shell_command_builder`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/shell.rs
git commit -m "feat(shell): add ShellCommand builder"
```

---

## Task 7: Add run() method

**Files:**
- Modify: `src-tauri/src/shell.rs`

**Step 1: Write test for run()**

Add to tests module:

```rust
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
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p k8s-gui-lib test_shell_command_run`
Expected: FAIL - no method `run` found

**Step 3: Implement run() method**

Add to `ShellCommand` impl block:

```rust
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
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p k8s-gui-lib test_shell_command_run`
Expected: PASS (both tests)

**Step 5: Commit**

```bash
git add src-tauri/src/shell.rs
git commit -m "feat(shell): add run() method with timeout"
```

---

## Task 8: Add run_success() convenience method

**Files:**
- Modify: `src-tauri/src/shell.rs`

**Step 1: Write test for run_success()**

Add to tests module:

```rust
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
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p k8s-gui-lib test_shell_command_run_success`
Expected: FAIL - no method `run_success` found

**Step 3: Implement run_success() method**

Add to `ShellCommand` impl block:

```rust
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
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p k8s-gui-lib test_shell_command_run_success`
Expected: PASS (both tests)

**Step 5: Commit**

```bash
git add src-tauri/src/shell.rs
git commit -m "feat(shell): add run_success() convenience method"
```

---

## Task 9: Initialize PATH in main.rs

**Files:**
- Modify: `src-tauri/src/main.rs`

**Step 1: Find setup hook in main.rs**

Look for `.setup(|app|` in main.rs and add PATH initialization.

**Step 2: Add PATH initialization**

Add import at top of main.rs:

```rust
use k8s_gui_lib::shell;
```

Inside the `.setup()` closure, add near the beginning:

```rust
// Initialize user PATH for shell commands
tauri::async_runtime::block_on(async {
    shell::init_user_path().await;
});
tracing::info!("User PATH initialized");
```

**Step 3: Verify it compiles**

Run: `cargo build -p k8s-gui`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat(shell): initialize user PATH at app startup"
```

---

## Task 10: Refactor commands/helm.rs

**Files:**
- Modify: `src-tauri/src/commands/helm.rs`

**Step 1: Replace exec_helm_cli_with_context**

Find function `exec_helm_cli_with_context` (around line 465) and replace implementation:

```rust
use crate::shell::ShellCommand;

/// Helper to execute helm CLI commands with optional kube context
async fn exec_helm_cli_with_context(args: &[&str], timeout_secs: u64, context: Option<&str>) -> Result<String> {
    let helm_path = resolve_helm_path().await?;

    let mut cmd = ShellCommand::new(&helm_path)
        .args(args.iter().map(|s| s.to_string()))
        .timeout(Duration::from_secs(timeout_secs));

    if let Some(ctx) = context {
        cmd = cmd.arg("--kube-context").arg(ctx);
    }

    cmd.run_success()
        .await
        .map_err(|e| Error::Plugin(PluginError::ExecutionFailed(e.to_string())))
}
```

**Step 2: Remove unused imports**

Remove these imports from top of file (no longer needed):
- `use std::process::Stdio;`
- `use tokio::process::Command;`
- `use tokio::time::{timeout, Duration};` → keep only `Duration`

Add:
```rust
use crate::shell::ShellCommand;
```

**Step 3: Update try_helm_path function**

Replace `try_helm_path` function:

```rust
/// Try to run helm version with a specific path
async fn try_helm_path(path: &str) -> Option<String> {
    let output = ShellCommand::new(path)
        .args(["version", "--short"])
        .timeout(Duration::from_secs(5))
        .run()
        .await
        .ok()?;

    if output.success() {
        Some(output.stdout.trim().to_string())
    } else {
        None
    }
}
```

**Step 4: Run tests**

Run: `cargo test -p k8s-gui-lib`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src-tauri/src/commands/helm.rs
git commit -m "refactor(helm): use ShellCommand wrapper"
```

---

## Task 11: Refactor commands/kubectl.rs

**Files:**
- Modify: `src-tauri/src/commands/kubectl.rs`

**Step 1: Update imports**

Replace:
```rust
use std::process::Stdio;
use tokio::process::Command;
```

With:
```rust
use crate::shell::ShellCommand;
use std::time::Duration;
```

**Step 2: Replace try_kubectl_path function**

```rust
/// Try to run kubectl version with a specific path
async fn try_kubectl_path(path: &str) -> Option<String> {
    let output = ShellCommand::new(path)
        .args(["version", "--client", "-o=yaml"])
        .timeout(Duration::from_secs(5))
        .run()
        .await
        .ok()?;

    if output.success() {
        // Parse version from YAML output
        for line in output.stdout.lines() {
            if line.trim().starts_with("gitVersion:") {
                return Some(line.trim().replace("gitVersion:", "").trim().to_string());
            }
        }
        Some("unknown".to_string())
    } else {
        None
    }
}
```

**Step 3: Run tests**

Run: `cargo test -p k8s-gui-lib`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src-tauri/src/commands/kubectl.rs
git commit -m "refactor(kubectl): use ShellCommand wrapper"
```

---

## Task 12: Refactor plugins/helm.rs

**Files:**
- Modify: `src-tauri/src/plugins/helm.rs`

**Step 1: Update imports**

Replace:
```rust
use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{timeout, Duration};
```

With:
```rust
use crate::shell::ShellCommand;
use std::time::Duration;
```

**Step 2: Replace exec_helm method**

In `HelmPlugin` impl, replace `exec_helm` method:

```rust
/// Execute helm command
async fn exec_helm(&self, args: &[&str], context: &PluginContext) -> Result<PluginResult> {
    let mut cmd = ShellCommand::new(&self.helm_path)
        .args(args.iter().map(|s| s.to_string()))
        .arg("--kube-context")
        .arg(&context.kube_context)
        .timeout(Duration::from_secs(context.timeout_secs));

    // Set kubeconfig
    if let Some(kubeconfig) = &context.kubeconfig_path {
        cmd = cmd.env("KUBECONFIG", kubeconfig);
    }

    let output = cmd.run().await.map_err(|e| {
        Error::Plugin(PluginError::ExecutionFailed(e.to_string()))
    })?;

    Ok(PluginResult {
        exit_code: output.exit_code,
        stdout: output.stdout,
        stderr: output.stderr,
        data: None,
    })
}
```

**Step 3: Run tests**

Run: `cargo test -p k8s-gui-lib`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src-tauri/src/plugins/helm.rs
git commit -m "refactor(plugins/helm): use ShellCommand wrapper"
```

---

## Task 13: Refactor plugins/kubectl.rs

**Files:**
- Modify: `src-tauri/src/plugins/kubectl.rs`

**Step 1: Update imports**

Replace:
```rust
use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{timeout, Duration};
```

With:
```rust
use crate::shell::ShellCommand;
use std::time::Duration;
```

**Step 2: Replace execute method in KubectlPlugin**

In `KubectlPlugin` impl, replace `execute` method:

```rust
/// Execute the plugin
pub async fn execute(&self, args: &[String], context: &PluginContext) -> Result<PluginResult> {
    if !self.executable {
        return Err(Error::Plugin(PluginError::ExecutionFailed(format!(
            "Plugin {} is not executable",
            self.name
        ))));
    }

    let mut cmd = ShellCommand::new(&self.path)
        .args(args.iter().map(|s| s.to_string()))
        .timeout(Duration::from_secs(context.timeout_secs));

    // Set environment
    cmd = cmd.env(
        "KUBECONFIG",
        context.kubeconfig_path.as_deref().unwrap_or(""),
    );

    for (key, value) in &context.env {
        cmd = cmd.env(key, value);
    }

    // Set working directory
    if let Some(work_dir) = &context.work_dir {
        cmd = cmd.current_dir(work_dir);
    }

    let output = cmd.run().await.map_err(|e| {
        Error::Plugin(PluginError::ExecutionFailed(e.to_string()))
    })?;

    Ok(PluginResult {
        exit_code: output.exit_code,
        stdout: output.stdout,
        stderr: output.stderr,
        data: None,
    })
}
```

**Step 3: Run tests**

Run: `cargo test -p k8s-gui-lib`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src-tauri/src/plugins/kubectl.rs
git commit -m "refactor(plugins/kubectl): use ShellCommand wrapper"
```

---

## Task 14: Run all tests and verify

**Step 1: Run full test suite**

Run: `cargo test -p k8s-gui-lib`
Expected: All tests pass (66+ tests)

**Step 2: Run clippy**

Run: `cargo clippy -p k8s-gui-lib -- -D warnings`
Expected: No warnings

**Step 3: Build the app**

Run: `cargo build -p k8s-gui`
Expected: Builds successfully

**Step 4: Final commit with summary**

```bash
git add -A
git status
# If there are any uncommitted changes:
git commit -m "chore: cleanup after ShellCommand refactor"
```

---

## Summary

After completing all tasks:
- New `shell` module with `ShellCommand` wrapper
- User PATH resolved from login shell at startup
- Fallback to known paths if shell fails
- 4 files refactored to use new wrapper
- All tests passing

**Files changed:**
- `src-tauri/src/shell.rs` (new)
- `src-tauri/src/lib.rs` (add module)
- `src-tauri/src/main.rs` (init PATH)
- `src-tauri/src/commands/helm.rs` (refactor)
- `src-tauri/src/commands/kubectl.rs` (refactor)
- `src-tauri/src/plugins/helm.rs` (refactor)
- `src-tauri/src/plugins/kubectl.rs` (refactor)
