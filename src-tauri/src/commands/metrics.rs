//! Metrics API commands
//!
//! Tauri commands for fetching resource usage metrics from Kubernetes Metrics API

use crate::error::Result;
use crate::metrics::{
    get_cluster_metrics as fetch_cluster_metrics, get_node_metrics, get_pod_metrics,
    ClusterMetricsResponse, NodeMetricsResponse, PodMetricsResponse,
};
use crate::state::AppState;
use tauri::State;

/// Get pod metrics from Metrics API
#[tauri::command]
pub async fn get_pods_metrics(
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<PodMetricsResponse> {
    get_pod_metrics(namespace.as_deref(), &state).await
}

/// Get node metrics from Metrics API
#[tauri::command]
pub async fn get_nodes_metrics(
    state: State<'_, AppState>,
) -> Result<NodeMetricsResponse> {
    get_node_metrics(&state).await
}

/// Get aggregated cluster metrics
#[tauri::command]
pub async fn get_cluster_metrics(
    state: State<'_, AppState>,
) -> Result<ClusterMetricsResponse> {
    fetch_cluster_metrics(&state).await
}
