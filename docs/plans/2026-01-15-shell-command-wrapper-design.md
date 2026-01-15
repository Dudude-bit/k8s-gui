# Shell Command Wrapper Design

## Problem

GUI applications on macOS/Linux don't inherit the user's shell PATH. When launched via Finder/launcher, they get minimal PATH from `launchd` (typically only `/usr/bin:/bin:/usr/sbin:/sbin`), missing paths like `/opt/homebrew/bin`, `~/.local/bin`, asdf/mise shims, etc.

Currently, the codebase has 6 files using `tokio::process::Command` with duplicated logic for:
- Searching known binary paths (kubectl, helm, cloud CLIs)
- Setting up Stdio
- Handling timeouts
- Processing output

## Solution

Create a `ShellCommand` wrapper that:
1. Resolves user PATH from login shell once at startup
2. Provides a builder API similar to `std::process::Command`
3. Includes built-in timeout support
4. Unifies common patterns across the codebase

## Architecture

### New Module: `src-tauri/src/shell.rs`

```
src-tauri/src/
├── shell.rs          # New module
│   ├── UserPath      # PATH caching
│   ├── ShellCommand  # Command builder
│   └── CommandOutput # Execution result
├── lib.rs            # Add: pub mod shell
└── main.rs           # Initialize PATH at startup
```

### PATH Resolution

At application startup:
1. Execute `$SHELL -l -c 'echo $PATH'` to get user's login shell PATH
2. Cache result in `OnceCell<String>`
3. If shell fails, fall back to known paths

Fallback paths:
- `/opt/homebrew/bin` (macOS ARM)
- `/usr/local/bin` (macOS Intel, Linux)
- `~/.local/bin`
- `~/.asdf/shims`
- `/snap/bin` (Linux)
- Current process PATH

### ShellCommand API

```rust
pub struct ShellCommand {
    program: String,
    args: Vec<String>,
    envs: HashMap<String, String>,
    timeout: Duration,
    current_dir: Option<PathBuf>,
}

impl ShellCommand {
    pub fn new(program: impl Into<String>) -> Self;
    pub fn arg(self, arg: impl Into<String>) -> Self;
    pub fn args<I, S>(self, args: I) -> Self;
    pub fn env(self, key: impl Into<String>, val: impl Into<String>) -> Self;
    pub fn timeout(self, timeout: Duration) -> Self;
    pub fn current_dir(self, dir: impl Into<PathBuf>) -> Self;

    pub async fn run(self) -> Result<CommandOutput>;
    pub async fn run_success(self) -> Result<String>;
}

pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}
```

### Usage Example

```rust
// Before
let helm_path = resolve_helm_path().await?;
let mut cmd = Command::new(&helm_path);
cmd.args(args);
cmd.stdout(Stdio::piped());
cmd.stderr(Stdio::piped());
let output = timeout(timeout_duration, cmd.output()).await??;
// ... handle output

// After
let output = ShellCommand::new(&helm_path)
    .args(args)
    .timeout(Duration::from_secs(60))
    .run_success()
    .await?;
```

## Error Handling

New error type in `shell.rs`:

```rust
#[derive(Debug, thiserror::Error)]
pub enum ShellError {
    #[error("Command timed out after {0:?}")]
    Timeout(Duration),

    #[error("Failed to execute command: {0}")]
    Exec(String),

    #[error("Command failed: {0}")]
    Failed(String),
}
```

Integration with existing `Error` enum via `#[from]` derive.

## Files to Change

| File | Change |
|------|--------|
| `src-tauri/src/shell.rs` | New module |
| `src-tauri/src/lib.rs` | Add `pub mod shell` |
| `src-tauri/src/main.rs` | Initialize PATH at startup |
| `src-tauri/src/error.rs` | Add `Shell` variant |
| `src-tauri/src/commands/kubectl.rs` | Use ShellCommand |
| `src-tauri/src/commands/helm.rs` | Use ShellCommand |
| `src-tauri/src/plugins/kubectl.rs` | Use ShellCommand |
| `src-tauri/src/plugins/helm.rs` | Use ShellCommand |
| `src-tauri/src/auth/interactive.rs` | Partial refactor |

## Testing

Unit tests:
- Fallback PATH contains common directories
- ShellCommand executes simple commands
- Timeout works correctly
- Non-existent commands fail gracefully

Integration test (manual):
- Verify kubectl/helm found via resolved PATH

## Out of Scope (YAGNI)

- Retry logic
- Structured logging beyond tracing
- Async PATH refresh
- Windows-specific PATH handling (can be added later)
