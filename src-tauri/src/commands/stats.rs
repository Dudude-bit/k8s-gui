//! Cluster statistics commands

use crate::state::AppState;
use crate::utils::normalize_namespace;
use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::{Node, Pod, Service};
use kube::{api::ListParams, Api};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Pod statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PodStats {
    pub total: usize,
    pub running: usize,
    pub pending: usize,
    pub failed: usize,
    pub succeeded: usize,
}

/// Deployment statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentStats {
    pub total: usize,
    pub available: usize,
    pub unavailable: usize,
}

/// Service statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceStats {
    pub total: usize,
}

/// Node statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeStats {
    pub total: usize,
    pub ready: usize,
}

/// Overall cluster statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterStats {
    pub pods: PodStats,
    pub deployments: DeploymentStats,
    pub services: ServiceStats,
    pub nodes: NodeStats,
}

/// Get cluster statistics in a single efficient call
#[tauri::command]
pub async fn get_cluster_stats(
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ClusterStats, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let params = ListParams::default();
    let namespace = normalize_namespace(namespace, state.get_namespace(&context));

    // Fetch all resources in parallel
    let (pods_result, deployments_result, services_result, nodes_result) = tokio::join!(
        async {
            let api: Api<Pod> = match namespace.as_ref() {
                Some(ns) => Api::namespaced((*client).clone(), ns),
                None => Api::all((*client).clone()),
            };
            api.list(&params).await
        },
        async {
            let api: Api<Deployment> = match namespace.as_ref() {
                Some(ns) => Api::namespaced((*client).clone(), ns),
                None => Api::all((*client).clone()),
            };
            api.list(&params).await
        },
        async {
            let api: Api<Service> = match namespace.as_ref() {
                Some(ns) => Api::namespaced((*client).clone(), ns),
                None => Api::all((*client).clone()),
            };
            api.list(&params).await
        },
        async {
            let api: Api<Node> = Api::all((*client).clone());
            api.list(&params).await
        }
    );

    // Process pods
    let pods = pods_result.map_err(|e| format!("Failed to list pods: {}", e))?;
    let pod_stats = PodStats {
        total: pods.items.len(),
        running: pods.items.iter().filter(|p| {
            p.status.as_ref()
                .and_then(|s| s.phase.as_ref())
                .map(|phase| phase == "Running")
                .unwrap_or(false)
        }).count(),
        pending: pods.items.iter().filter(|p| {
            p.status.as_ref()
                .and_then(|s| s.phase.as_ref())
                .map(|phase| phase == "Pending")
                .unwrap_or(false)
        }).count(),
        failed: pods.items.iter().filter(|p| {
            p.status.as_ref()
                .and_then(|s| s.phase.as_ref())
                .map(|phase| phase == "Failed")
                .unwrap_or(false)
        }).count(),
        succeeded: pods.items.iter().filter(|p| {
            p.status.as_ref()
                .and_then(|s| s.phase.as_ref())
                .map(|phase| phase == "Succeeded")
                .unwrap_or(false)
        }).count(),
    };

    // Process deployments
    let deployments = deployments_result.map_err(|e| format!("Failed to list deployments: {}", e))?;
    let deployment_stats = DeploymentStats {
        total: deployments.items.len(),
        available: deployments.items.iter().filter(|d| {
            d.status.as_ref()
                .map(|s| {
                    let ready = s.ready_replicas.unwrap_or(0);
                    let desired = s.replicas.unwrap_or(0);
                    ready > 0 && ready == desired
                })
                .unwrap_or(false)
        }).count(),
        unavailable: deployments.items.iter().filter(|d| {
            d.status.as_ref()
                .map(|s| {
                    let ready = s.ready_replicas.unwrap_or(0);
                    let desired = s.replicas.unwrap_or(0);
                    ready < desired
                })
                .unwrap_or(true)
        }).count(),
    };

    // Process services
    let services = services_result.map_err(|e| format!("Failed to list services: {}", e))?;
    let service_stats = ServiceStats {
        total: services.items.len(),
    };

    // Process nodes
    let nodes = nodes_result.map_err(|e| format!("Failed to list nodes: {}", e))?;
    let node_stats = NodeStats {
        total: nodes.items.len(),
        ready: nodes.items.iter().filter(|n| {
            n.status.as_ref()
                .and_then(|s| s.conditions.as_ref())
                .map(|conditions| {
                    conditions.iter().any(|c| c.type_ == "Ready" && c.status == "True")
                })
                .unwrap_or(false)
        }).count(),
    };

    Ok(ClusterStats {
        pods: pod_stats,
        deployments: deployment_stats,
        services: service_stats,
        nodes: node_stats,
    })
}
