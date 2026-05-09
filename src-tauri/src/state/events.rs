//! `AppEvent` enum and the per-variant payload helpers carried over
//! the broadcast channel to the frontend.

use crate::logs::{LogFormat, LogLevel};
use std::collections::BTreeMap;

/// One log line as carried inside a `LogBatch`. Mirrors the subset of
/// `LogLine` that the frontend consumes — pod/container/namespace are
/// per-batch context (already known by the receiving hook) so they're
/// omitted here to keep the payload small.
#[derive(Debug, Clone, serde::Serialize)]
pub struct LogLineEvent {
    pub message: String,
    pub timestamp: Option<String>,
    pub level: Option<LogLevel>,
    pub format: LogFormat,
    pub fields: Option<BTreeMap<String, String>>,
    pub raw: String,
}

/// Operation type for a resource-watch event. Mirrors `kube::runtime::watcher::Event`
/// flattened to a string the frontend can switch on.
#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WatchOp {
    /// Resource was added or updated (the watcher merges these).
    Applied,
    /// Resource was deleted.
    Deleted,
    /// Watcher restarted (resync) — frontend should clear its cache
    /// before the burst of `applied` events that follows.
    Restarted,
    /// Watch failed N times in a row without recovery (typically RBAC
    /// `watch` verb missing, or kube-apiserver unreachable). The
    /// frontend should fall back to periodic refresh and tell the
    /// user. The watcher task keeps retrying in the background; if
    /// it eventually recovers, an `applied`/`restarted` resets the
    /// state and a fresh `failed` would only be emitted after another
    /// streak of errors.
    Failed,
}

/// Events that can be broadcast to frontend
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", content = "data")]
pub enum AppEvent {
    /// Resource was created
    ResourceCreated {
        kind: String,
        name: String,
        namespace: String,
    },
    /// Resource was updated
    ResourceUpdated {
        kind: String,
        name: String,
        namespace: String,
    },
    /// Resource was deleted
    ResourceDeleted {
        kind: String,
        name: String,
        namespace: String,
    },
    /// Connection status changed
    ConnectionStatusChanged { context: String, connected: bool },
    /// Batch of log lines for a single stream. The streamer flushes
    /// every ~50ms (or sooner if the buffer fills) so that verbose
    /// pods don't generate one Tauri round-trip per line. Always
    /// non-empty.
    LogBatch {
        stream_id: String,
        lines: Vec<LogLineEvent>,
    },
    /// One Kubernetes watch event for a resource of a known kind.
    /// Forwarded to the frontend so it can update the TanStack Query
    /// cache directly, replacing the old 2s polling refresh model.
    /// The `resource` JSON is the typed resource serialized via
    /// the same path the existing list/get commands use.
    ResourceWatchEvent {
        stream_id: String,
        op: WatchOp,
        /// Set on `applied`/`deleted`. None on `restarted` resyncs
        /// and on `failed` events.
        resource: Option<serde_json::Value>,
        /// Set on `failed` events with the error string (RBAC
        /// denial, network error, etc.). None for every other op.
        error: Option<String>,
    },
    /// Terminal output received
    TerminalOutput { session_id: String, data: String },
    /// Terminal session closed
    TerminalClosed {
        session_id: String,
        status: Option<String>,
    },
    /// Port-forward status update
    PortForwardStatus {
        id: String,
        pod: String,
        namespace: String,
        local_port: u16,
        remote_port: u16,
        status: String,
        message: Option<String>,
        attempt: Option<u32>,
    },
    /// Auth URL requested for interactive login
    AuthUrlRequested {
        context: String,
        url: String,
        flow: String,
        session_id: Option<String>,
    },
    /// Auth flow completed
    AuthFlowCompleted {
        session_id: String,
        context: String,
        success: bool,
        message: Option<String>,
    },
    /// Auth flow cancelled
    AuthFlowCancelled {
        session_id: String,
        context: String,
        message: Option<String>,
    },
    /// Auth terminal session created (for interactive exec auth)
    AuthTerminalSessionCreated {
        auth_session_id: String,
        terminal_session_id: String,
        context: String,
        command: String,
    },
    /// Error occurred
    Error { code: String, message: String },
}
