//! Cluster statistics commands

use crate::commands::helpers::ResourceContext;
use crate::error::{Error, Result};
use crate::state::AppState;
use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::{Node, Pod, Service};
use kube::api::ListParams;
use kube::Api;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Pod statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodStats {
    pub total: usize,
    pub running: usize,
    pub pending: usize,
    pub failed: usize,
    pub succeeded: usize,
}

/// Deployment statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentStats {
    pub total: usize,
    pub available: usize,
    pub unavailable: usize,
}

/// Service statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStats {
    pub total: usize,
}

/// Node statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeStats {
    pub total: usize,
    pub ready: usize,
}

/// Overall cluster statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
) -> Result<ClusterStats> {
    let ctx = ResourceContext::for_list(&state, namespace)?;
    let params = ListParams::default();
    let pods_api: Api<Pod> = ctx.namespaced_or_cluster_api();
    let deployments_api: Api<Deployment> = ctx.namespaced_or_cluster_api();
    let services_api: Api<Service> = ctx.namespaced_or_cluster_api();
    let nodes_api: Api<Node> = ctx.cluster_api();

    // Fetch all resources in parallel
    let (pods_result, deployments_result, services_result, nodes_result) = tokio::join!(
        pods_api.list(&params),
        deployments_api.list(&params),
        services_api.list(&params),
        nodes_api.list(&params),
    );

    // Process pods
    let pods = pods_result.map_err(Error::from)?;
    let pod_stats = PodStats {
        total: pods.items.len(),
        running: pods
            .items
            .iter()
            .filter(|p| {
                p.status
                    .as_ref()
                    .and_then(|s| s.phase.as_ref())
                    .is_some_and(|phase| phase == "Running")
            })
            .count(),
        pending: pods
            .items
            .iter()
            .filter(|p| {
                p.status
                    .as_ref()
                    .and_then(|s| s.phase.as_ref())
                    .is_some_and(|phase| phase == "Pending")
            })
            .count(),
        failed: pods
            .items
            .iter()
            .filter(|p| {
                p.status
                    .as_ref()
                    .and_then(|s| s.phase.as_ref())
                    .is_some_and(|phase| phase == "Failed")
            })
            .count(),
        succeeded: pods
            .items
            .iter()
            .filter(|p| {
                p.status
                    .as_ref()
                    .and_then(|s| s.phase.as_ref())
                    .is_some_and(|phase| phase == "Succeeded")
            })
            .count(),
    };

    // Process deployments
    let deployments = deployments_result.map_err(Error::from)?;
    let deployment_stats = DeploymentStats {
        total: deployments.items.len(),
        available: deployments
            .items
            .iter()
            .filter(|d| {
                d.status.as_ref().is_some_and(|s| {
                    let ready = s.ready_replicas.unwrap_or(0);
                    let desired = s.replicas.unwrap_or(0);
                    ready > 0 && ready == desired
                })
            })
            .count(),
        unavailable: deployments
            .items
            .iter()
            .filter(|d| {
                d.status.as_ref().is_none_or(|s| {
                    let ready = s.ready_replicas.unwrap_or(0);
                    let desired = s.replicas.unwrap_or(0);
                    ready < desired
                })
            })
            .count(),
    };

    // Process services
    let services = services_result.map_err(Error::from)?;
    let service_stats = ServiceStats {
        total: services.items.len(),
    };

    // Process nodes
    let nodes = nodes_result.map_err(Error::from)?;
    let node_stats = NodeStats {
        total: nodes.items.len(),
        ready: nodes
            .items
            .iter()
            .filter(|n| {
                n.status
                    .as_ref()
                    .and_then(|s| s.conditions.as_ref())
                    .is_some_and(|conditions| {
                        conditions
                            .iter()
                            .any(|c| c.type_ == "Ready" && c.status == "True")
                    })
            })
            .count(),
    };

    Ok(ClusterStats {
        pods: pod_stats,
        deployments: deployment_stats,
        services: service_stats,
        nodes: node_stats,
    })
}
