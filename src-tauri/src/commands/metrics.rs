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
    let client = get_k8s_client(&state)?;
    get_pod_metrics(&client, namespace.as_deref(), &state).await
}

/// Get node metrics from Metrics API
#[tauri::command]
pub async fn get_nodes_metrics(
    state: State<'_, AppState>,
) -> Result<Vec<NodeMetrics>> {
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
    let client = get_k8s_client(&state)?;
    
    // Get node metrics
    let node_metrics = get_node_metrics(&client, &state).await?;
    
    // TODO: Aggregate metrics and get capacity from nodes
    // For now, return empty metrics
    Ok(ClusterMetrics {
        total_cpu_usage: None,
        total_memory_usage: None,
        total_cpu_capacity: None,
        total_memory_capacity: None,
    })
}

