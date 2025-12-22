//! Events commands

use crate::commands::helpers::{CommandContext, ListContext};
use crate::error::Result;
use crate::resources::EventInfo;
use crate::state::AppState;
use k8s_openapi::api::core::v1::Event;
use kube::api::ListParams;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Event filters
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EventFilters {
    pub namespace: Option<String>,
    pub involved_object_name: Option<String>,
    pub involved_object_kind: Option<String>,
    pub event_type: Option<String>, // "Normal" or "Warning"
    pub field_selector: Option<String>,
    pub limit: Option<i64>,
}

/// List events with optional filters
#[tauri::command]
pub async fn list_events(
    filters: Option<EventFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<EventInfo>> {
    let filters = filters.unwrap_or_default();
    let ctx = ListContext::new(&state, filters.namespace)?;

    let mut params = ListParams::default();

    // Build field selector
    let mut field_selectors = Vec::new();
    if let Some(name) = &filters.involved_object_name {
        field_selectors.push(format!("involvedObject.name={}", name));
    }
    if let Some(kind) = &filters.involved_object_kind {
        field_selectors.push(format!("involvedObject.kind={}", kind));
    }
    if let Some(custom) = &filters.field_selector {
        field_selectors.push(custom.clone());
    }

    if !field_selectors.is_empty() {
        params = params.fields(&field_selectors.join(","));
    }

    if let Some(limit) = filters.limit {
        if limit > 0 {
            params = params.limit(limit as u32);
        }
    }

    let api: kube::Api<Event> = ctx.api();
    let list = api.list(&params).await?;

    let mut events: Vec<EventInfo> = list.items.iter().map(EventInfo::from).collect();

    // Filter by event type if specified
    if let Some(event_type) = &filters.event_type {
        events.retain(|e| e.type_.eq_ignore_ascii_case(event_type));
    }

    // Sort by last timestamp (most recent first)
    events.sort_by(|a, b| b.last_timestamp.cmp(&a.last_timestamp));

    Ok(events)
}

/// List all events in a namespace (including all types)
#[tauri::command]
pub async fn list_all_events(
    namespace: Option<String>,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<EventInfo>> {
    list_events(
        Some(EventFilters {
            namespace,
            limit,
            ..Default::default()
        }),
        state,
    )
    .await
}

/// List warning events only
#[tauri::command]
pub async fn list_warning_events(
    namespace: Option<String>,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<EventInfo>> {
    list_events(
        Some(EventFilters {
            namespace,
            event_type: Some("Warning".to_string()),
            limit,
            ..Default::default()
        }),
        state,
    )
    .await
}

/// Get events for a specific resource
#[tauri::command]
pub async fn get_resource_events(
    name: String,
    kind: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<EventInfo>> {
    list_events(
        Some(EventFilters {
            namespace,
            involved_object_name: Some(name),
            involved_object_kind: Some(kind),
            ..Default::default()
        }),
        state,
    )
    .await
}

/// Get events for a pod
#[tauri::command]
pub async fn get_pod_events(
    pod_name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<EventInfo>> {
    get_resource_events(pod_name, "Pod".to_string(), namespace, state).await
}

/// Get events for a deployment
#[tauri::command]
pub async fn get_deployment_events(
    deployment_name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<EventInfo>> {
    get_resource_events(deployment_name, "Deployment".to_string(), namespace, state).await
}

/// Get events for a node
#[tauri::command]
pub async fn get_node_events(node_name: String, state: State<'_, AppState>) -> Result<Vec<EventInfo>> {
    let ctx = CommandContext::new(&state, Some("default".to_string()))?;

    let params = ListParams::default()
        .fields(&format!("involvedObject.name={},involvedObject.kind=Node", node_name));

    let api: kube::Api<Event> = ctx.namespaced_api();
    let list = api.list(&params).await?;

    let mut events: Vec<EventInfo> = list.items.iter().map(EventInfo::from).collect();
    events.sort_by(|a, b| b.last_timestamp.cmp(&a.last_timestamp));

    Ok(events)
}

/// Watch events (returns subscription ID)
#[tauri::command]
pub async fn watch_events(
    namespace: Option<String>,
    _event_type: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    let _ctx = ListContext::new(&state, namespace)?;
    let watch_id = state.new_watch_id();

    // TODO: Implement event watching with proper streaming
    Ok(watch_id)
}

/// Stop watching events
#[tauri::command]
pub async fn stop_watch_events(watch_id: String, state: State<'_, AppState>) -> Result<()> {
    if let Some((_, subscription)) = state.watch_subscriptions.remove(&watch_id) {
        let _ = subscription.cancel_tx.send(());
    }
    Ok(())
}

/// Event summary for a namespace
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventSummary {
    pub total: usize,
    pub normal: usize,
    pub warning: usize,
    pub error: usize,
    pub recent_warnings: Vec<EventInfo>,
}

/// Get event summary for a namespace
#[tauri::command]
pub async fn get_event_summary(
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<EventSummary> {
    let events = list_all_events(namespace, None, state).await?;

    let total = events.len();
    let normal = events.iter().filter(|e| e.type_ == "Normal").count();
    let warning = events.iter().filter(|e| e.type_ == "Warning").count();
    let error = events
        .iter()
        .filter(|e| {
            e.reason
                .as_ref()
                .map(|r| r.to_lowercase().contains("error"))
                .unwrap_or(false)
        })
        .count();

    let recent_warnings: Vec<EventInfo> = events
        .into_iter()
        .filter(|e| e.type_ == "Warning")
        .take(5)
        .collect();

    Ok(EventSummary {
        total,
        normal,
        warning,
        error,
        recent_warnings,
    })
}
