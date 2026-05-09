//! Kubernetes Metrics API integration.
//!
//! Provides functionality to fetch resource usage metrics (CPU, Memory)
//! from the Kubernetes Metrics API (`/apis/metrics.k8s.io/v1beta1/`).
//!
//! - `types`: frontend Metrics types + internal serde shapes
//! - `parse`: kube DynamicObject → frontend types, status mapping,
//!           shared `fetch_metrics` generic helper

mod parse;
mod types;

pub use types::{
    ClusterMetrics, ClusterMetricsResponse, MetricsStatus, MetricsStatusKind, NodeMetrics,
    NodeMetricsResponse, PodMetrics, PodMetricsResponse,
};

use crate::commands::helpers::ResourceContext;
use crate::error::Result;
use crate::state::AppState;
use crate::utils::quantities::{parse_cpu, parse_memory};

use parse::{fetch_metrics, parse_node_metric, parse_pod_metric};

/// Get pod metrics from Metrics API
pub async fn get_pod_metrics(
    namespace: Option<&str>,
    state: &AppState,
) -> Result<PodMetricsResponse> {
    let (status, data) = fetch_metrics(state, namespace, "PodMetrics", parse_pod_metric).await?;
    Ok(PodMetricsResponse { status, data })
}

/// Get node metrics from Metrics API
pub async fn get_node_metrics(state: &AppState) -> Result<NodeMetricsResponse> {
    let (status, data) = fetch_metrics(state, None, "NodeMetrics", parse_node_metric).await?;
    Ok(NodeMetricsResponse { status, data })
}

/// Get aggregated cluster metrics (total CPU/memory usage and capacity)
pub async fn get_cluster_metrics(state: &AppState) -> Result<ClusterMetricsResponse> {
    use k8s_openapi::api::core::v1::Node;
    use kube::api::ListParams;

    let ctx = ResourceContext::for_list_from_app_state(state, None)?;
    let client = ctx.client.clone();

    // Get node metrics (usage)
    let node_metrics_response = get_node_metrics(state).await?;

    // Get nodes to extract capacity
    let node_api: kube::Api<Node> = kube::Api::all(client);
    let nodes = node_api.list(&ListParams::default()).await?;

    let mut total_cpu_usage = 0.0f64;
    let mut total_memory_usage = 0u64;
    let mut has_cpu_usage = false;
    let mut has_memory_usage = false;

    for metric in &node_metrics_response.data {
        if let Some(cpu) = metric.cpu_millicores {
            has_cpu_usage = true;
            total_cpu_usage += cpu;
        }
        if let Some(memory) = metric.memory_bytes {
            has_memory_usage = true;
            total_memory_usage += memory;
        }
    }

    let mut total_cpu_capacity = 0.0f64;
    let mut total_memory_capacity = 0u64;
    let mut has_cpu_capacity = false;
    let mut has_memory_capacity = false;

    for node in &nodes.items {
        if let Some(status) = &node.status {
            if let Some(capacity) = &status.capacity {
                if let Some(cpu_qty) = capacity.get("cpu") {
                    has_cpu_capacity = true;
                    total_cpu_capacity += parse_cpu(&cpu_qty.0);
                }
                if let Some(mem_qty) = capacity.get("memory") {
                    has_memory_capacity = true;
                    total_memory_capacity += parse_memory(&mem_qty.0);
                }
            }
        }
    }

    Ok(ClusterMetricsResponse {
        status: node_metrics_response.status,
        data: ClusterMetrics {
            total_cpu_millicores: if has_cpu_usage {
                Some(total_cpu_usage)
            } else {
                None
            },
            total_memory_bytes: if has_memory_usage {
                Some(total_memory_usage)
            } else {
                None
            },
            total_cpu_capacity_millicores: if has_cpu_capacity {
                Some(total_cpu_capacity)
            } else {
                None
            },
            total_memory_capacity_bytes: if has_memory_capacity {
                Some(total_memory_capacity)
            } else {
                None
            },
        },
    })
}
