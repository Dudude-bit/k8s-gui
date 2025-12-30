//! Kubernetes Metrics API integration
//!
//! Provides functionality to fetch resource usage metrics (CPU, Memory)
//! from the Kubernetes Metrics API (/apis/metrics.k8s.io/v1beta1/)

use crate::error::{Error, Result};
use crate::metrics::helpers::{
    format_cpu_from_millicores, parse_cpu_to_millicores, parse_memory_to_bytes,
};
use crate::state::AppState;
use reqwest::header::AUTHORIZATION;
use reqwest::Client as HttpClient;
use serde::{Deserialize, Serialize};

pub mod helpers;

/// Pod metrics from Metrics API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodMetrics {
    pub name: String,
    pub namespace: String,
    pub cpu_usage: Option<String>, // in millicores or cores (e.g., "500m", "2")
    pub memory_usage: Option<String>, // in bytes (will be formatted on frontend)
}

/// Node metrics from Metrics API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeMetrics {
    pub name: String,
    pub cpu_usage: Option<String>,    // in millicores or cores
    pub memory_usage: Option<String>, // in bytes
}

/// Cluster metrics (aggregated)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterMetrics {
    pub total_cpu_usage: Option<String>,
    pub total_memory_usage: Option<String>,
    pub total_cpu_capacity: Option<String>,
    pub total_memory_capacity: Option<String>,
}

// ============================================================================
// Internal API Response Structures
// ============================================================================

#[derive(Debug, Deserialize)]
struct PodMetricsList {
    items: Vec<PodMetricsItem>,
}

#[derive(Debug, Deserialize)]
struct PodMetricsItem {
    metadata: PodMetricsMetadata,
    #[serde(rename = "containers")]
    containers: Vec<ContainerMetrics>,
    #[allow(dead_code)]
    #[serde(rename = "window")]
    window: String,
    #[allow(dead_code)]
    #[serde(rename = "timestamp")]
    timestamp: String,
}

#[derive(Debug, Deserialize)]
struct PodMetricsMetadata {
    name: String,
    namespace: String,
}

#[derive(Debug, Deserialize)]
struct ContainerMetrics {
    #[allow(dead_code)]
    name: String,
    usage: ContainerUsage,
}

#[derive(Debug, Deserialize)]
struct ContainerUsage {
    cpu: Option<String>,
    memory: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NodeMetricsList {
    items: Vec<NodeMetricsItem>,
}

#[derive(Debug, Deserialize)]
struct NodeMetricsItem {
    metadata: NodeMetricsMetadata,
    usage: ContainerUsage,
    #[allow(dead_code)]
    #[serde(rename = "window")]
    window: String,
    #[allow(dead_code)]
    #[serde(rename = "timestamp")]
    timestamp: String,
}

#[derive(Debug, Deserialize)]
struct NodeMetricsMetadata {
    name: String,
}

// ============================================================================
// Metrics Client (eliminates duplication, adds authentication)
// ============================================================================

/// Client for accessing Kubernetes Metrics API with proper authentication.
///
/// This client handles the complexities of:
/// - Extracting cluster configuration from kubeconfig
/// - Setting up TLS (including insecure mode)
/// - Adding authentication headers (Bearer token, etc.)
pub struct MetricsClient {
    http_client: HttpClient,
    base_url: String,
    auth_header: Option<String>,
}

impl MetricsClient {
    /// Create a new `MetricsClient` from the current application state.
    ///
    /// Extracts the cluster configuration, TLS settings, and authentication
    /// credentials from the kubeconfig.
    pub async fn from_state(state: &AppState) -> Result<Self> {
        let context = state
            .get_current_context()
            .ok_or_else(|| Error::Connection("No cluster connected".to_string()))?;

        let kubeconfig = state
            .client_manager
            .kubeconfig_clone()
            .await
            .map_err(|e| Error::Config(format!("Failed to get kubeconfig: {e}")))?;

        // Find cluster name from context
        let cluster_name = kubeconfig
            .contexts
            .iter()
            .find(|c| c.name == context)
            .and_then(|c| c.context.as_ref())
            .map(|c| &c.cluster)
            .ok_or_else(|| Error::Config("Cluster not found in kubeconfig".to_string()))?;

        // Find user name from context
        let user_name = kubeconfig
            .contexts
            .iter()
            .find(|c| c.name == context)
            .and_then(|c| c.context.as_ref())
            .and_then(|c| c.user.as_ref());

        // Get cluster configuration
        let cluster = kubeconfig
            .clusters
            .iter()
            .find(|c| c.name == *cluster_name)
            .and_then(|c| c.cluster.as_ref())
            .ok_or_else(|| Error::Config("Cluster config not found".to_string()))?;

        let base_url = cluster
            .server
            .as_deref()
            .ok_or_else(|| Error::Config("Cluster server URL not found".to_string()))?
            .to_string();

        let insecure_skip_tls = cluster.insecure_skip_tls_verify.unwrap_or(false);

        // Extract authentication token from user configuration
        let auth_header = if let Some(user_name) = user_name {
            kubeconfig
                .auth_infos
                .iter()
                .find(|a| &a.name == user_name)
                .and_then(|a| a.auth_info.as_ref())
                .and_then(|auth| {
                    // Try token first (SecretBox requires expose_secret())
                    if let Some(token) = &auth.token {
                        use secrecy::ExposeSecret;
                        return Some(format!("Bearer {}", token.expose_secret()));
                    }
                    // Try token-file
                    if let Some(token_file) = &auth.token_file {
                        if let Ok(token) = std::fs::read_to_string(token_file) {
                            return Some(format!("Bearer {}", token.trim()));
                        }
                    }
                    None
                })
        } else {
            None
        };

        // Build HTTP client with TLS configuration
        let http_client = HttpClient::builder()
            .danger_accept_invalid_certs(insecure_skip_tls)
            .build()
            .map_err(|e| Error::Connection(format!("Failed to create HTTP client: {e}")))?;

        Ok(Self {
            http_client,
            base_url,
            auth_header,
        })
    }

    /// Make a GET request to the Metrics API.
    async fn get<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<Option<T>> {
        let url = format!("{}{}", self.base_url, path);

        let mut request = self.http_client.get(&url);

        // Add authorization header if available
        if let Some(auth) = &self.auth_header {
            request = request.header(AUTHORIZATION, auth);
        }

        let response = request
            .send()
            .await
            .map_err(|e| Error::Connection(format!("Failed to fetch metrics: {e}")))?;

        // Check if Metrics API is available
        if response.status() == 404 {
            tracing::debug!("Metrics API not available (404) for path: {}", path);
            return Ok(None);
        }

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            tracing::warn!("Metrics API returned error {}: {}", status, text);
            return Ok(None);
        }

        let result: T = response
            .json()
            .await
            .map_err(|e| Error::Serialization(format!("Failed to parse metrics response: {e}")))?;

        Ok(Some(result))
    }

    /// Get pod metrics for a specific namespace or all namespaces.
    pub async fn get_pod_metrics(&self, namespace: Option<&str>) -> Result<Vec<PodMetrics>> {
        let path = match namespace {
            Some(ns) => format!("/apis/metrics.k8s.io/v1beta1/namespaces/{ns}/pods"),
            None => "/apis/metrics.k8s.io/v1beta1/pods".to_string(),
        };

        let metrics_list: Option<PodMetricsList> = self.get(&path).await?;

        let Some(metrics_list) = metrics_list else {
            return Ok(vec![]);
        };

        let result = metrics_list
            .items
            .into_iter()
            .map(|item| {
                let (total_cpu_millicores, total_memory_bytes) =
                    item.containers
                        .iter()
                        .fold((0.0f64, 0u64), |(cpu, mem), container| {
                            let cpu_delta = container
                                .usage
                                .cpu
                                .as_ref()
                                .and_then(|s| parse_cpu_to_millicores(s).ok())
                                .unwrap_or(0.0);
                            let mem_delta = container
                                .usage
                                .memory
                                .as_ref()
                                .and_then(|s| parse_memory_to_bytes(s).ok())
                                .unwrap_or(0);
                            (cpu + cpu_delta, mem + mem_delta)
                        });

                PodMetrics {
                    name: item.metadata.name,
                    namespace: item.metadata.namespace,
                    cpu_usage: if total_cpu_millicores > 0.0 {
                        Some(format_cpu_from_millicores(total_cpu_millicores))
                    } else {
                        None
                    },
                    memory_usage: if total_memory_bytes > 0 {
                        Some(format!("{total_memory_bytes}"))
                    } else {
                        None
                    },
                }
            })
            .collect();

        Ok(result)
    }

    /// Get node metrics.
    ///
    /// # Errors
    ///
    /// Returns an error if the Metrics API request fails or the response cannot be parsed.
    pub async fn get_node_metrics(&self) -> Result<Vec<NodeMetrics>> {
        let path = "/apis/metrics.k8s.io/v1beta1/nodes";

        let metrics_list: Option<NodeMetricsList> = self.get(path).await?;

        let Some(metrics_list) = metrics_list else {
            return Ok(vec![]);
        };

        let result = metrics_list
            .items
            .into_iter()
            .map(|item| {
                let cpu_usage = item.usage.cpu.as_ref().map(|s| {
                    parse_cpu_to_millicores(s)
                        .map_or_else(|_| s.clone(), format_cpu_from_millicores)
                });

                let memory_usage = item.usage.memory.as_ref().map(|s| {
                    parse_memory_to_bytes(s).map_or_else(|_| s.clone(), |bytes| format!("{bytes}"))
                });

                NodeMetrics {
                    name: item.metadata.name,
                    cpu_usage,
                    memory_usage,
                }
            })
            .collect();

        Ok(result)
    }
}

// ============================================================================
// Public API Functions (use MetricsClient internally)
// ============================================================================

/// Get pod metrics from Metrics API
///
/// # Errors
///
/// Returns an error if the Metrics API request fails or the response cannot be parsed.
pub async fn get_pod_metrics(namespace: Option<&str>, state: &AppState) -> Result<Vec<PodMetrics>> {
    let metrics_client = MetricsClient::from_state(state).await?;
    metrics_client.get_pod_metrics(namespace).await
}

/// Get node metrics from Metrics API
///
/// # Errors
///
/// Returns an error if the Metrics API request fails or the response cannot be parsed.
pub async fn get_node_metrics(state: &AppState) -> Result<Vec<NodeMetrics>> {
    let metrics_client = MetricsClient::from_state(state).await?;
    metrics_client.get_node_metrics().await
}

/// Get aggregated cluster metrics (total CPU/memory usage and capacity)
///
/// # Errors
///
/// Returns an error if the Metrics API or Kubernetes API requests fail,
/// or if the response cannot be parsed.
pub async fn get_cluster_metrics(state: &AppState) -> Result<ClusterMetrics> {
    use k8s_openapi::api::core::v1::Node;
    use kube::api::ListParams;

    let context = state
        .get_current_context()
        .ok_or_else(|| Error::Connection("No cluster connected".to_string()))?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| Error::Connection("Client not found".to_string()))?;

    // Get node metrics (usage)
    let metrics_client = MetricsClient::from_state(state).await?;
    let node_metrics = metrics_client.get_node_metrics().await?;

    // Get nodes to extract capacity
    let node_api: kube::Api<Node> = kube::Api::all((*client).clone());
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
    Ok(ClusterMetrics {
        total_cpu_usage: if total_cpu_cores > 0.0 {
            Some(format_cpu_from_millicores(total_cpu_cores))
        } else {
            None
        },
        total_memory_usage: if total_memory_bytes > 0 {
            Some(format!("{total_memory_bytes}"))
        } else {
            None
        },
        total_cpu_capacity: if total_cpu_capacity_cores > 0.0 {
            Some(format_cpu_from_millicores(total_cpu_capacity_cores))
        } else {
            None
        },
        total_memory_capacity: if total_memory_capacity_bytes > 0 {
            Some(format!("{total_memory_capacity_bytes}"))
        } else {
            None
        },
    })
}
