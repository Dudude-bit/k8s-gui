//! `WatchSession` bookkeeping + the RAII cleanup guard.
//!
//! The session table lives on `WatchManager`; this module owns the
//! per-entry shape and the guard that removes that entry on every
//! spawn-task exit path (including panic-unwind).

use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::oneshot;

/// Live watch session bookkeeping. Stored in `WatchManager` so the
/// `unsubscribe` and `mark_subscribed` Tauri commands can find a
/// session by its stream id.
pub struct WatchSession {
    pub id: String,
    pub kind: String,
    pub namespace: Option<String>,
    /// Cancel signal to the watcher task.
    pub(super) cancel_tx: Option<oneshot::Sender<()>>,
    /// Subscribe gate. Released by `mark_subscribed` once the
    /// frontend has registered `listen("resource-event")`.
    pub(super) subscribe_tx: Option<oneshot::Sender<()>>,
}

impl WatchSession {
    pub fn close(&mut self) {
        if let Some(tx) = self.cancel_tx.take() {
            let _ = tx.send(());
        }
    }

    pub fn mark_subscribed(&mut self) {
        if let Some(tx) = self.subscribe_tx.take() {
            let _ = tx.send(());
        }
    }
}

/// RAII guard that removes a watch session entry on every spawn-task
/// exit path — natural completion, error return, panic-unwind. Same
/// pattern as `LogStreamCleanup` and `PortForwardCleanup`.
pub(super) struct WatchCleanup {
    pub sessions: Arc<DashMap<String, WatchSession>>,
    pub key: String,
}

impl Drop for WatchCleanup {
    fn drop(&mut self) {
        self.sessions.remove(&self.key);
    }
}
