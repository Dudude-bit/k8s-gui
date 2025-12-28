//! Node commands

use crate::commands::helpers::{build_list_params, ListContext};
use crate::error::Result;
use crate::resources::{NodeInfo, PodInfo};
use crate::state::AppState;
use k8s_openapi::api::core::v1::{Node, Pod};
use kube::api::ListParams;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tauri::State;

/// Node list filters
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
    ).await?;

    let mut nodes: Vec<NodeInfo> = list.items.iter().map(NodeInfo::from).collect();

    if filters.ready_only.unwrap_or(false) {
        nodes.retain(|n| n.status.ready);
    }

    Ok(nodes)
}

/// Get a single node by name
#[tauri::command]
pub async fn get_node(name: String, state: State<'_, AppState>) -> Result<NodeInfo> {
    let ctx = ListContext::new(&state, None)?;
    let api: kube::Api<Node> = ctx.cluster_api();
    let node = api.get(&name).await?;

    Ok(NodeInfo::from(&node))
}

/// Get full node YAML
#[tauri::command]
pub async fn get_node_yaml(name: String, state: State<'_, AppState>) -> Result<String> {
    let ctx = ListContext::new(&state, None)?;
    let api: kube::Api<Node> = ctx.cluster_api();
    let node = api.get(&name).await?;

    let yaml = serde_yaml::to_string(&node)
        .map_err(|e| crate::error::Error::Serialization(e.to_string()))?;
    super::helpers::clean_yaml_for_editor(&yaml)
}

/// Node resource usage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeResourceUsage {
    pub cpu_capacity: String,
    pub cpu_allocatable: String,
    pub memory_capacity: String,
    pub memory_allocatable: String,
    pub pods_capacity: String,
    pub pods_allocatable: String,
}

fn get_quantity(
    map: &BTreeMap<String, k8s_openapi::apimachinery::pkg::api::resource::Quantity>,
    key: &str,
) -> String {
    map.get(key).map(|q| q.0.clone()).unwrap_or_default()
}

/// Get node resource usage
#[tauri::command]
pub async fn get_node_resources(
    name: String,
    state: State<'_, AppState>,
) -> Result<NodeResourceUsage> {
    let ctx = ListContext::new(&state, None)?;
    let api: kube::Api<Node> = ctx.cluster_api();
    let node = api.get(&name).await?;

    let status = node
        .status
        .ok_or_else(|| crate::error::Error::InvalidInput("Node has no status".to_string()))?;
    let capacity = status.capacity.unwrap_or_default();
    let allocatable = status.allocatable.unwrap_or_default();

    Ok(NodeResourceUsage {
        cpu_capacity: get_quantity(&capacity, "cpu"),
        cpu_allocatable: get_quantity(&allocatable, "cpu"),
        memory_capacity: get_quantity(&capacity, "memory"),
        memory_allocatable: get_quantity(&allocatable, "memory"),
        pods_capacity: get_quantity(&capacity, "pods"),
        pods_allocatable: get_quantity(&allocatable, "pods"),
    })
}

/// Node condition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeCondition {
    pub condition_type: String,
    pub status: String,
    pub reason: Option<String>,
    pub message: Option<String>,
    pub last_heartbeat: Option<String>,
    pub last_transition: Option<String>,
}

/// Get node conditions
#[tauri::command]
pub async fn get_node_conditions(
    name: String,
    state: State<'_, AppState>,
) -> Result<Vec<NodeCondition>> {
    let ctx = ListContext::new(&state, None)?;
    let api: kube::Api<Node> = ctx.cluster_api();
    let node = api.get(&name).await?;

    let conditions: Vec<NodeCondition> = node
        .status
        .and_then(|s| s.conditions)
        .map(|cs| {
            cs.into_iter()
                .map(|c| NodeCondition {
                    condition_type: c.type_,
                    status: c.status,
                    reason: c.reason,
                    message: c.message,
                    last_heartbeat: c.last_heartbeat_time.map(|t| t.0.to_rfc3339()),
                    last_transition: c.last_transition_time.map(|t| t.0.to_rfc3339()),
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(conditions)
}

/// Get pods running on a node
#[tauri::command]
pub async fn get_node_pods(name: String, state: State<'_, AppState>) -> Result<Vec<PodInfo>> {
    let ctx = ListContext::new(&state, None)?;
    let api: kube::Api<Pod> = ctx.api();

    let params = ListParams::default().fields(&format!("spec.nodeName={}", name));
    let pods = api.list(&params).await?;

    Ok(pods.items.iter().map(PodInfo::from).collect())
}

/// Cordon a node (mark as unschedulable)
#[tauri::command]
pub async fn cordon_node(name: String, state: State<'_, AppState>) -> Result<()> {
    let ctx = ListContext::new(&state, None)?;
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
    let ctx = ListContext::new(&state, None)?;
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

    let ctx = ListContext::new(&state, None)?;
    let api: kube::Api<Pod> = ctx.api();

    let params = ListParams::default().fields(&format!("spec.nodeName={}", name));
    let pods = api.list(&params).await?;

    let ignore_daemonsets = ignore_daemonsets.unwrap_or(true);
    let _force = force.unwrap_or(false);

    for pod in pods.items {
        let pod_name = pod.metadata.name.unwrap_or_default();
        let namespace = pod.metadata.namespace.unwrap_or_else(|| "default".to_string());

        // Skip DaemonSet pods if configured
        if ignore_daemonsets {
            if let Some(refs) = pod.metadata.owner_references {
                if refs.iter().any(|r| r.kind == "DaemonSet") {
                    continue;
                }
            }
        }

        // Evict the pod
        let pod_api: kube::Api<Pod> = kube::Api::namespaced(ctx.client.clone(), &namespace);
        let evict_params = kube::api::EvictParams::default();
        let _ = pod_api.evict(&pod_name, &evict_params).await;
    }

    Ok(())
}
