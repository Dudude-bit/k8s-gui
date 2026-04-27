//! Tauri commands for the resource-watch subsystem.
//!
//! Pattern mirrors `commands/logs.rs`: a typed `subscribe_*_watch`
//! command per resource kind returns a stream id; a generic
//! `resource_watch_subscribed` releases the deferred-start gate; a
//! generic `unsubscribe_resource_watch` cancels.
//!
//! Phase 1 ships ConfigMap end-to-end as the proof. Other resource
//! kinds get their own typed `subscribe_*_watch` command in follow-up
//! PRs — they all share the gate / unsubscribe / event plumbing.

use crate::error::{Error, Result};
use crate::resources::ConfigMapInfo;
use crate::state::AppState;
use crate::utils::normalize_optional_namespace;
use k8s_openapi::api::core::v1::ConfigMap;
use tauri::State;

/// Subscribe to ConfigMap changes for a namespace (or cluster-wide if
/// `namespace` is `None`/empty). Returns a stream id the frontend uses
/// to listen for `resource-event` Tauri events and to unsubscribe.
///
/// Each watch event payload is the same `ConfigMapInfo` shape the
/// `list_configmaps` command returns, so the frontend hook can plug
/// the watch directly into the existing TanStack Query cache via
/// `setQueryData`.
#[tauri::command]
pub fn subscribe_configmap_watch(
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| Error::Internal(crate::error::messages::NO_CLUSTER.to_string()))?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| Error::Internal(crate::error::messages::NO_CLIENT.to_string()))?;

    let namespace = normalize_optional_namespace(namespace);

    Ok(state.watch_manager.subscribe::<ConfigMap, _, _>(
        (*client).clone(),
        "ConfigMap",
        namespace,
        |cm| Some(ConfigMapInfo::from(cm)),
    ))
}

/// Signal that the frontend has registered its `resource-event`
/// listener. The watcher task is gated on this signal so the very
/// first `restarted` + applied-burst aren't lost. Idempotent.
#[tauri::command]
pub fn resource_watch_subscribed(stream_id: String, state: State<'_, AppState>) -> Result<()> {
    state.watch_manager.mark_subscribed(&stream_id)
}

/// Cancel a watch session. Idempotent — unsubscribing twice is a
/// no-op so racing cleanup paths don't fail.
#[tauri::command]
pub fn unsubscribe_resource_watch(stream_id: String, state: State<'_, AppState>) {
    state.watch_manager.unsubscribe(&stream_id);
}
