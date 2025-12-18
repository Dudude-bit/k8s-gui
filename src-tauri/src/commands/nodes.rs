//! Node commands

use crate::resources::NodeInfo;
use crate::state::AppState;
use kube::api::ListParams;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Node list filters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeFilters {
    pub label_selector: Option<String>,
    pub ready_only: Option<bool>,
}

/// List all nodes
#[tauri::command]
pub async fn list_nodes(
    filters: Option<NodeFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<NodeInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let filters = filters.unwrap_or_else(|| NodeFilters {
        label_selector: None,
        ready_only: None,
    });

    let mut params = ListParams::default();
    if let Some(labels) = &filters.label_selector {
        params = params.labels(labels);
    }

    let api: kube::Api<k8s_openapi::api::core::v1::Node> = 
        kube::Api::all((*client).clone());
    let list = api.list(&params).await.map_err(|e| e.to_string())?;

    let mut nodes: Vec<NodeInfo> = list.items.iter().map(NodeInfo::from).collect();

    // Filter by ready status if specified
    if filters.ready_only.unwrap_or(false) {
        nodes.retain(|n| n.status.ready);
    }

    Ok(nodes)
}

/// Get a single node by name
#[tauri::command]
pub async fn get_node(
    name: String,
    state: State<'_, AppState>,
) -> Result<NodeInfo, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let api: kube::Api<k8s_openapi::api::core::v1::Node> = 
        kube::Api::all((*client).clone());
    let node = api.get(&name).await.map_err(|e| e.to_string())?;

    Ok(NodeInfo::from(&node))
}

/// Get full node YAML
#[tauri::command]
pub async fn get_node_yaml(
    name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let api: kube::Api<k8s_openapi::api::core::v1::Node> = 
        kube::Api::all((*client).clone());
    let node = api.get(&name).await.map_err(|e| e.to_string())?;

    serde_yaml::to_string(&node).map_err(|e| e.to_string())
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

/// Get node resource usage
#[tauri::command]
pub async fn get_node_resources(
    name: String,
    state: State<'_, AppState>,
) -> Result<NodeResourceUsage, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let api: kube::Api<k8s_openapi::api::core::v1::Node> = 
        kube::Api::all((*client).clone());
    let node = api.get(&name).await.map_err(|e| e.to_string())?;

    let status = node.status.ok_or("Node has no status")?;
    let capacity = status.capacity.unwrap_or_default();
    let allocatable = status.allocatable.unwrap_or_default();

    fn get_quantity(map: &std::collections::BTreeMap<String, k8s_openapi::apimachinery::pkg::api::resource::Quantity>, key: &str) -> String {
        map.get(key).map(|q| q.0.clone()).unwrap_or_default()
    }

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
) -> Result<Vec<NodeCondition>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let api: kube::Api<k8s_openapi::api::core::v1::Node> = 
        kube::Api::all((*client).clone());
    let node = api.get(&name).await.map_err(|e| e.to_string())?;

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
pub async fn get_node_pods(
    name: String,
    state: State<'_, AppState>,
) -> Result<Vec<crate::resources::PodInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let api: kube::Api<k8s_openapi::api::core::v1::Pod> = 
        kube::Api::all((*client).clone());
    
    let params = ListParams::default().fields(&format!("spec.nodeName={}", name));
    let pods = api.list(&params).await.map_err(|e| e.to_string())?;

    let pod_infos: Vec<crate::resources::PodInfo> = pods
        .items
        .iter()
        .map(crate::resources::PodInfo::from)
        .collect();

    Ok(pod_infos)
}

/// Cordon a node (mark as unschedulable)
#[tauri::command]
pub async fn cordon_node(
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let api: kube::Api<k8s_openapi::api::core::v1::Node> = 
        kube::Api::all((*client).clone());

    let patch = serde_json::json!({
        "spec": {
            "unschedulable": true
        }
    });

    api.patch(&name, &kube::api::PatchParams::default(), &kube::api::Patch::Merge(&patch))
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Uncordon a node (mark as schedulable)
#[tauri::command]
pub async fn uncordon_node(
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let api: kube::Api<k8s_openapi::api::core::v1::Node> = 
        kube::Api::all((*client).clone());

    let patch = serde_json::json!({
        "spec": {
            "unschedulable": false
        }
    });

    api.patch(&name, &kube::api::PatchParams::default(), &kube::api::Patch::Merge(&patch))
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Drain a node (evict all pods)
#[tauri::command]
pub async fn drain_node(
    name: String,
    ignore_daemonsets: Option<bool>,
    force: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // First cordon the node
    cordon_node(name.clone(), state.clone()).await?;

    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    // Get pods on the node
    let api: kube::Api<k8s_openapi::api::core::v1::Pod> = 
        kube::Api::all((*client).clone());
    
    let params = ListParams::default().fields(&format!("spec.nodeName={}", name));
    let pods = api.list(&params).await.map_err(|e| e.to_string())?;

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

        // Evict the pod using the evict subresource on Pod API
        let pod_api: kube::Api<k8s_openapi::api::core::v1::Pod> = 
            kube::Api::namespaced((*client).clone(), &namespace);
        
        // Use EvictParams for eviction
        let evict_params = kube::api::EvictParams::default();

        // Use evict subresource - POST /api/v1/namespaces/{namespace}/pods/{name}/eviction
        let _ = pod_api.evict(&pod_name, &evict_params).await;
    }

    Ok(())
}
