//! Node commands

use crate::commands::helpers::ResourceContext;
use crate::error::Result;
use crate::resources::{NodeInfo, PodInfo};
use crate::state::AppState;
use k8s_openapi::api::core::v1::{Node, Pod};
use kube::api::ListParams;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Node list filters
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeFilters {
    pub label_selector: Option<String>,
    pub field_selector: Option<String>,
    pub limit: Option<i64>,
    pub ready_only: Option<bool>,
}

/// List all nodes
#[tauri::command]
pub async fn list_nodes(
    filters: Option<NodeFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<NodeInfo>> {
    let filters = filters.unwrap_or_default();

    let list = crate::commands::helpers::list_cluster_resources::<Node>(
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    )
    .await?;

    let mut nodes: Vec<NodeInfo> = list.items.iter().map(NodeInfo::from).collect();

    if filters.ready_only.unwrap_or(false) {
        nodes.retain(|n| n.status.ready);
    }

    Ok(nodes)
}

/// Get a single node by name
#[tauri::command]
pub async fn get_node(name: String, state: State<'_, AppState>) -> Result<NodeInfo> {
    let ctx = ResourceContext::for_list(&state, None)?;
    let api: kube::Api<Node> = ctx.cluster_api();
    let node = api.get(&name).await?;

    Ok(NodeInfo::from(&node))
}

/// Get pods running on a node
#[tauri::command]
pub async fn get_node_pods(name: String, state: State<'_, AppState>) -> Result<Vec<PodInfo>> {
    let ctx = ResourceContext::for_list(&state, None)?;
    let api: kube::Api<Pod> = ctx.namespaced_or_cluster_api();

    let params = ListParams::default().fields(&format!("spec.nodeName={name}"));
    let pods = api.list(&params).await?;

    Ok(pods.items.iter().map(PodInfo::from).collect())
}

/// Cordon a node (mark as unschedulable)
#[tauri::command]
pub async fn cordon_node(name: String, state: State<'_, AppState>) -> Result<()> {
    let ctx = ResourceContext::for_list(&state, None)?;
    let api: kube::Api<Node> = ctx.cluster_api();

    let patch = serde_json::json!({
        "spec": { "unschedulable": true }
    });

    api.patch(
        &name,
        &kube::api::PatchParams::default(),
        &kube::api::Patch::Merge(&patch),
    )
    .await?;

    Ok(())
}

/// Uncordon a node (mark as schedulable)
#[tauri::command]
pub async fn uncordon_node(name: String, state: State<'_, AppState>) -> Result<()> {
    let ctx = ResourceContext::for_list(&state, None)?;
    let api: kube::Api<Node> = ctx.cluster_api();

    let patch = serde_json::json!({
        "spec": { "unschedulable": false }
    });

    api.patch(
        &name,
        &kube::api::PatchParams::default(),
        &kube::api::Patch::Merge(&patch),
    )
    .await?;

    Ok(())
}

/// Drain a node (evict all pods)
#[tauri::command]
pub async fn drain_node(
    name: String,
    ignore_daemonsets: Option<bool>,
    force: Option<bool>,
    state: State<'_, AppState>,
) -> Result<()> {
    // First cordon the node
    cordon_node(name.clone(), state.clone()).await?;

    let ctx = ResourceContext::for_list(&state, None)?;
    let api: kube::Api<Pod> = ctx.namespaced_or_cluster_api();

    let params = ListParams::default().fields(&format!("spec.nodeName={name}"));
    let pods = api.list(&params).await?;

    let ignore_daemonsets = ignore_daemonsets.unwrap_or(true);
    let _force = force.unwrap_or(false);

    for pod in pods.items {
        let pod_name = pod.metadata.name.unwrap_or_default();
        let namespace = pod
            .metadata
            .namespace
            .unwrap_or_else(|| "default".to_string());

        // Skip DaemonSet pods if configured
        if ignore_daemonsets {
            if let Some(refs) = pod.metadata.owner_references {
                if refs.iter().any(|r| r.kind == "DaemonSet") {
                    continue;
                }
            }
        }

        // Evict the pod
        let pod_ctx = ResourceContext::for_command(&state, Some(namespace))?;
        let pod_api: kube::Api<Pod> = pod_ctx.namespaced_api();
        let evict_params = kube::api::EvictParams::default();
        let _ = pod_api.evict(&pod_name, &evict_params).await;
    }

    Ok(())
}
