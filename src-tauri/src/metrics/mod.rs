//! Kubernetes Metrics API integration
//!
//! Provides functionality to fetch resource usage metrics (CPU, Memory)
//! from the Kubernetes Metrics API (/apis/metrics.k8s.io/v1beta1/)

use crate::error::Result;
use crate::state::AppState;
use crate::utils::quantities::{parse_cpu, parse_memory};
use crate::commands::helpers::ResourceContext;
use kube::api::ListParams;
use kube::core::DynamicObject;
use kube::discovery::ApiResource;
use kube::Api;
use serde::{Deserialize, Serialize};

// ============================================================================
// Public Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MetricsStatusKind {
    Available,
    NotInstalled,
    Forbidden,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricsStatus {
    pub status: MetricsStatusKind,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodMetricsResponse {
    pub status: MetricsStatus,
    pub data: Vec<PodMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeMetricsResponse {
    pub status: MetricsStatus,
    pub data: Vec<NodeMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterMetricsResponse {
    pub status: MetricsStatus,
    pub data: ClusterMetrics,
}

/// Pod metrics from Metrics API (values are in millicores/bytes)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodMetrics {
    pub name: String,
    pub namespace: String,
    pub cpu_millicores: Option<f64>,
    pub memory_bytes: Option<u64>,
}

/// Node metrics from Metrics API (values are in millicores/bytes)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeMetrics {
    pub name: String,
    pub cpu_millicores: Option<f64>,
    pub memory_bytes: Option<u64>,
}

/// Cluster metrics (aggregated, values are in millicores/bytes)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterMetrics {
    pub total_cpu_millicores: Option<f64>,
    pub total_memory_bytes: Option<u64>,
    pub total_cpu_capacity_millicores: Option<f64>,
    pub total_memory_capacity_bytes: Option<u64>,
}

// ============================================================================
// Internal API Response Structures
// ============================================================================

#[derive(Debug, Deserialize)]
struct PodMetricsItem {
    metadata: PodMetricsMetadata,
    #[serde(rename = "containers")]
    containers: Vec<ContainerMetrics>,
}

#[derive(Debug, Deserialize)]
struct PodMetricsMetadata {
    name: String,
    namespace: String,
}

#[derive(Debug, Deserialize)]
struct ContainerMetrics {
    usage: ContainerUsage,
}

#[derive(Debug, Deserialize)]
struct ContainerUsage {
    cpu: Option<String>,
    memory: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NodeMetricsItem {
    metadata: NodeMetricsMetadata,
    usage: ContainerUsage,
}

#[derive(Debug, Deserialize)]
struct NodeMetricsMetadata {
    name: String,
}

// ============================================================================
// Helpers
// ============================================================================

fn metrics_status_available() -> MetricsStatus {
    MetricsStatus {
        status: MetricsStatusKind::Available,
        message: None,
    }
}

fn metrics_status_from_error(err: &kube::Error) -> MetricsStatus {
    match err {
        kube::Error::Api(api_err) => match api_err.code {
            404 => MetricsStatus {
                status: MetricsStatusKind::NotInstalled,
                message: Some(api_err.message.clone()),
            },
            401 | 403 => MetricsStatus {
                status: MetricsStatusKind::Forbidden,
                message: Some(api_err.message.clone()),
            },
            _ => MetricsStatus {
                status: MetricsStatusKind::Error,
                message: Some(format!("Metrics API error {}: {}", api_err.code, api_err.message)),
            },
        },
        _ => MetricsStatus {
            status: MetricsStatusKind::Error,
            message: Some(err.to_string()),
        },
    }
}

fn metrics_api_resource(kind: &str) -> ApiResource {
    let plural = match kind {
        "PodMetrics" => "pods",
        "NodeMetrics" => "nodes",
        _ => {
            let mut lower = kind.to_ascii_lowercase();
            lower.push('s');
            return ApiResource {
                group: "metrics.k8s.io".to_string(),
                version: "v1beta1".to_string(),
                api_version: "metrics.k8s.io/v1beta1".to_string(),
                kind: kind.to_string(),
                plural: lower,
            };
        }
    };

    ApiResource {
        group: "metrics.k8s.io".to_string(),
        version: "v1beta1".to_string(),
        api_version: "metrics.k8s.io/v1beta1".to_string(),
        kind: kind.to_string(),
        plural: plural.to_string(),
    }
}

fn metrics_api(ctx: &ResourceContext, kind: &str) -> Api<DynamicObject> {
    let api_resource = metrics_api_resource(kind);
    let is_cluster_scoped = kind == "NodeMetrics";
    ctx.dynamic_api_for_resource(&api_resource, is_cluster_scoped)
}

fn parse_pod_metric(item: DynamicObject) -> Option<PodMetrics> {
    let value = serde_json::to_value(&item).ok()?;
    let parsed: PodMetricsItem = serde_json::from_value(value).ok()?;

    let mut total_cpu = 0.0f64;
    let mut total_memory = 0u64;
    let mut has_cpu = false;
    let mut has_memory = false;

    for container in &parsed.containers {
        if let Some(cpu) = &container.usage.cpu {
            has_cpu = true;
            total_cpu += parse_cpu(cpu);
        }
        if let Some(memory) = &container.usage.memory {
            has_memory = true;
            total_memory += parse_memory(memory);
        }
    }

    Some(PodMetrics {
        name: parsed.metadata.name,
        namespace: parsed.metadata.namespace,
        cpu_millicores: if has_cpu { Some(total_cpu) } else { None },
        memory_bytes: if has_memory { Some(total_memory) } else { None },
    })
}

fn parse_node_metric(item: DynamicObject) -> Option<NodeMetrics> {
    let value = serde_json::to_value(&item).ok()?;
    let parsed: NodeMetricsItem = serde_json::from_value(value).ok()?;

    let cpu_millicores = parsed.usage.cpu.as_ref().map(|cpu| parse_cpu(cpu));
    let memory_bytes = parsed
        .usage
        .memory
        .as_ref()
        .map(|memory| parse_memory(memory));

    Some(NodeMetrics {
        name: parsed.metadata.name,
        cpu_millicores,
        memory_bytes,
    })
}

// ============================================================================
// Public API Functions
// ============================================================================

/// Get pod metrics from Metrics API
pub async fn get_pod_metrics(
    namespace: Option<&str>,
    state: &AppState,
) -> Result<PodMetricsResponse> {
    let ctx =
        ResourceContext::for_list_from_app_state(state, namespace.map(str::to_string))?;
    let api = metrics_api(&ctx, "PodMetrics");

    let list = match api.list(&ListParams::default()).await {
        Ok(list) => list,
        Err(err) => {
            return Ok(PodMetricsResponse {
                status: metrics_status_from_error(&err),
                data: vec![],
            })
        }
    };

    let mut metrics = Vec::new();
    for item in list.items {
        if let Some(metric) = parse_pod_metric(item) {
            metrics.push(metric);
        }
    }

    Ok(PodMetricsResponse {
        status: metrics_status_available(),
        data: metrics,
    })
}

/// Get node metrics from Metrics API
pub async fn get_node_metrics(state: &AppState) -> Result<NodeMetricsResponse> {
    let ctx = ResourceContext::for_list_from_app_state(state, None)?;
    let api = metrics_api(&ctx, "NodeMetrics");

    let list = match api.list(&ListParams::default()).await {
        Ok(list) => list,
        Err(err) => {
            return Ok(NodeMetricsResponse {
                status: metrics_status_from_error(&err),
                data: vec![],
            })
        }
    };

    let mut metrics = Vec::new();
    for item in list.items {
        if let Some(metric) = parse_node_metric(item) {
            metrics.push(metric);
        }
    }

    Ok(NodeMetricsResponse {
        status: metrics_status_available(),
        data: metrics,
    })
}

/// Get aggregated cluster metrics (total CPU/memory usage and capacity)
pub async fn get_cluster_metrics(
    state: &AppState,
) -> Result<ClusterMetricsResponse> {
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
