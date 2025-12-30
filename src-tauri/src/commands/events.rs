//! Events commands

use crate::commands::helpers::ListContext;
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
        field_selectors.push(format!("involvedObject.name={name}"));
    }
    if let Some(kind) = &filters.involved_object_kind {
        field_selectors.push(format!("involvedObject.kind={kind}"));
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

    // Use namespaced API when namespace is provided for proper filtering
    let api: kube::Api<Event> = if ctx.namespace.is_some() {
        ctx.namespaced_api()
    } else {
        ctx.api()
    };
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

