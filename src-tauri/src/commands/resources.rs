//! Generic resource management commands

use crate::commands::helpers::{build_list_params, get_k8s_client};
use crate::error::{Error, Result};
use crate::state::AppState;
use crate::utils::normalize_namespace;
use kube::api::DynamicObject;
use kube::discovery::{verbs, ApiCapabilities, ApiResource, Discovery, Scope};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Resource query parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceQuery {
    pub kind: String,
    pub namespace: Option<String>,
    pub name: Option<String>,
    pub label_selector: Option<String>,
    pub field_selector: Option<String>,
    pub limit: Option<i64>,
}

/// List resources of a given kind
#[tauri::command]
pub async fn list_resources(
    query: ResourceQuery,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>> {
    let context = state
        .get_current_context()
        .ok_or_else(|| Error::Internal("No cluster connected".to_string()))?;

    let client = get_k8s_client(&state)?;

    let namespace = normalize_namespace(query.namespace, state.get_namespace(&context));

    let params = build_list_params(
        query.label_selector.as_deref(),
        query.field_selector.as_deref(),
        query.limit,
    );

    let discovery = Discovery::new(client.clone()).run().await?;

    let (api_resource, caps) =
        resolve_api_resource(&discovery, &query.kind).ok_or_else(|| {
            Error::InvalidInput(format!("Unsupported resource kind: {}", query.kind))
        })?;

    if !caps.supports_operation(verbs::LIST) {
        return Err(Error::InvalidInput(format!(
            "Resource kind '{}' does not support list operation",
            query.kind
        )));
    }

    let api: kube::Api<DynamicObject> = match caps.scope {
        Scope::Namespaced => match namespace.as_ref() {
            Some(ns) => kube::Api::namespaced_with(client.clone(), ns, &api_resource),
            None => kube::Api::all_with(client.clone(), &api_resource),
        },
        Scope::Cluster => kube::Api::all_with(client.clone(), &api_resource),
    };

    let list = api.list(&params).await?;
    list.items
        .iter()
        .map(serde_json::to_value)
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(Error::from)
}

fn resolve_api_resource(
    discovery: &Discovery,
    kind: &str,
) -> Option<(ApiResource, ApiCapabilities)> {
    let needle = kind.trim().to_lowercase();
    if needle.is_empty() {
        return None;
    }

    let mut matches = Vec::new();
    for group in discovery.groups_alphabetical() {
        for (ar, caps) in group.recommended_resources() {
            let kind_lc = ar.kind.to_lowercase();
            let plural_lc = ar.plural.to_lowercase();
            if kind_lc == needle || plural_lc == needle {
                matches.push((ar, caps));
            }
        }
    }

    matches.into_iter().max_by(|(a, _), (b, _)| {
        let a_stable = is_stable_version(&a.version);
        let b_stable = is_stable_version(&b.version);
        a_stable
            .cmp(&b_stable)
            .then_with(|| (a.group == "extensions").cmp(&(b.group == "extensions")))
            .then_with(|| a.group.cmp(&b.group))
            .then_with(|| a.version.cmp(&b.version))
    })
}

fn is_stable_version(version: &str) -> bool {
    let lower = version.to_lowercase();
    !lower.contains("alpha") && !lower.contains("beta")
}
