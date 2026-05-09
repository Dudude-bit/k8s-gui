//! Translate `kube::runtime::watcher::Event<K>` into the
//! frontend-facing `AppEvent::ResourceWatchEvent`. Centralised here
//! so the op-tag mapping (Apply / Delete / Init* / InitDone)
//! lives in one place.

use crate::state::{AppEvent, WatchOp};
use kube::runtime::watcher::Event;
use serde::Serialize;
use tokio::sync::broadcast;

/// Emit a single watcher event to the broadcast channel. `transform`
/// converts a resource of kind `K` to whatever shape the frontend
/// cache expects (returns `None` to drop the event).
pub(super) fn emit_event<K, F, U>(
    event_tx: &broadcast::Sender<AppEvent>,
    stream_id: &str,
    event: Event<K>,
    transform: &F,
) where
    F: Fn(&K) -> Option<U>,
    U: Serialize,
{
    match event {
        Event::Apply(obj) => send(event_tx, stream_id, WatchOp::Applied, transform(&obj)),
        Event::Delete(obj) => {
            send(event_tx, stream_id, WatchOp::Deleted, transform(&obj));
        }
        Event::Init => {
            // Ignore — `InitApply` events follow and `InitDone` ends
            // the resync. We only emit a `restarted` once below.
        }
        Event::InitApply(obj) => {
            send(event_tx, stream_id, WatchOp::Applied, transform(&obj));
        }
        Event::InitDone => {
            send::<()>(event_tx, stream_id, WatchOp::Restarted, None);
        }
    }
}

fn send<U: Serialize>(
    event_tx: &broadcast::Sender<AppEvent>,
    stream_id: &str,
    op: WatchOp,
    obj: Option<U>,
) {
    let resource = obj.and_then(|o| serde_json::to_value(&o).ok());
    let _ = event_tx.send(AppEvent::ResourceWatchEvent {
        stream_id: stream_id.to_string(),
        op,
        resource,
        error: None,
    });
}
