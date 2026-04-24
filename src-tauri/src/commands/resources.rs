//! Generic resource management commands

use crate::commands::helpers::{build_list_params, ResourceContext};
use crate::error::{Error, Result};
use crate::state::AppState;
use kube::discovery::{verbs, ApiCapabilities, ApiResource, Discovery};
use kube::ResourceExt;
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMetadata {
    pub name: String,
    pub namespace: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceListItem {
    pub metadata: ResourceMetadata,
}

/// List resources of a given kind
#[tauri::command]
pub async fn list_resources(
    query: ResourceQuery,
    state: State<'_, AppState>,
) -> Result<Vec<ResourceListItem>> {
    let ctx = ResourceContext::for_list(&state, query.namespace)?;

    let params = build_list_params(
        query.label_selector.as_deref(),
        query.field_selector.as_deref(),
        query.limit,
    );

    let discovery = Discovery::new(ctx.client.clone()).run().await?;

    let (api_resource, caps) = resolve_api_resource(&discovery, &query.kind)
        .ok_or_else(|| Error::InvalidInput(format!("Unsupported resource kind: {}", query.kind)))?;

    if !caps.supports_operation(verbs::LIST) {
        return Err(Error::InvalidInput(format!(
            "Resource kind '{}' does not support list operation",
            query.kind
        )));
    }

    let api = ctx.dynamic_api(&api_resource, &caps);

    let list = api.list(&params).await?;
    Ok(list
        .items
        .into_iter()
        .map(|item| ResourceListItem {
            metadata: ResourceMetadata {
                name: item.name_any(),
                namespace: item.namespace(),
            },
        })
        .collect())
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
