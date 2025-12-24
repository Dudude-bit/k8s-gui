//! Metrics API commands
//! 
//! Provides Tauri commands for fetching resource usage metrics from Kubernetes Metrics API

use crate::commands::helpers::get_k8s_client;
use crate::error::Result;
use crate::metrics::{get_node_metrics, get_pod_metrics, get_single_pod_metrics, NodeMetrics, PodMetrics};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Get pod metrics from Metrics API
#[tauri::command]
pub async fn get_pods_metrics(
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<PodMetrics>> {
    crate::commands::helpers::check_premium_license().await?;
    let client = get_k8s_client(&state)?;
    get_pod_metrics(&client, namespace.as_deref(), &state).await
}

/// Get node metrics from Metrics API
#[tauri::command]
pub async fn get_nodes_metrics(
    state: State<'_, AppState>,
) -> Result<Vec<NodeMetrics>> {
    crate::commands::helpers::check_premium_license().await?;
    let client = get_k8s_client(&state)?;
    get_node_metrics(&client, &state).await
}

/// Get metrics for a specific pod
#[tauri::command]
pub async fn get_pod_metrics_command(
    name: String,
    namespace: String,
    state: State<'_, AppState>,
) -> Result<Option<PodMetrics>> {
    crate::commands::helpers::check_premium_license().await?;
    let client = get_k8s_client(&state)?;
    get_single_pod_metrics(&client, &namespace, &name, &state).await
}

/// Cluster metrics (aggregated)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterMetrics {
    pub total_cpu_usage: Option<String>,
    pub total_memory_usage: Option<String>,
    pub total_cpu_capacity: Option<String>,
    pub total_memory_capacity: Option<String>,
}

/// Get aggregated cluster metrics
#[tauri::command]
pub async fn get_cluster_metrics(
    state: State<'_, AppState>,
) -> Result<ClusterMetrics> {
    use crate::metrics::helpers::{parse_cpu_to_millicores, parse_memory_to_bytes, format_cpu_from_millicores};
    use k8s_openapi::api::core::v1::Node;
    use kube::api::ListParams;
    
    let client = get_k8s_client(&state)?;
    
    // Get node metrics (usage)
    let node_metrics = get_node_metrics(&client, &state).await?;
    
    // Get nodes to extract capacity
    let node_api: kube::Api<Node> = kube::Api::all(client);
    let nodes = node_api.list(&ListParams::default()).await?;
    
    // Aggregate CPU and memory usage from metrics
    let mut total_cpu_cores = 0.0;
    let mut total_memory_bytes = 0u64;
    
    for metric in &node_metrics {
        if let Some(cpu_str) = &metric.cpu_usage {
            if let Ok(cores) = parse_cpu_to_millicores(cpu_str) {
                total_cpu_cores += cores;
            }
        }
        if let Some(mem_str) = &metric.memory_usage {
            if let Ok(bytes) = parse_memory_to_bytes(mem_str) {
                total_memory_bytes += bytes;
            }
        }
    }
    
    // Aggregate CPU and memory capacity from nodes
    let mut total_cpu_capacity_cores = 0.0;
    let mut total_memory_capacity_bytes = 0u64;
    
    for node in &nodes.items {
        if let Some(status) = &node.status {
            if let Some(capacity) = &status.capacity {
                if let Some(cpu_qty) = capacity.get("cpu") {
                    if let Ok(cores) = parse_cpu_to_millicores(&cpu_qty.0) {
                        total_cpu_capacity_cores += cores;
                    }
                }
                if let Some(mem_qty) = capacity.get("memory") {
                    if let Ok(bytes) = parse_memory_to_bytes(&mem_qty.0) {
                        total_memory_capacity_bytes += bytes;
                    }
                }
            }
        }
    }
    
    // Format results
    let total_cpu_usage = if total_cpu_cores > 0.0 {
        Some(format_cpu_from_millicores(total_cpu_cores))
    } else {
        None
    };
    
    let total_memory_usage = if total_memory_bytes > 0 {
        Some(format!("{}", total_memory_bytes))
    } else {
        None
    };
    
    let total_cpu_capacity = if total_cpu_capacity_cores > 0.0 {
        Some(format_cpu_from_millicores(total_cpu_capacity_cores))
    } else {
        None
    };
    
    let total_memory_capacity = if total_memory_capacity_bytes > 0 {
        Some(format!("{}", total_memory_capacity_bytes))
    } else {
        None
    };
    
    Ok(ClusterMetrics {
        total_cpu_usage,
        total_memory_usage,
        total_cpu_capacity,
        total_memory_capacity,
    })
}

