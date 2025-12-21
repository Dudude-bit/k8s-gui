//! Deployment-specific commands

use crate::resources::DeploymentInfo;
use crate::state::AppState;
use crate::utils::{normalize_namespace, require_namespace};
use kube::api::{ListParams, Patch, PatchParams};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Deployment list filters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentFilters {
    pub namespace: Option<String>,
    pub label_selector: Option<String>,
    pub limit: Option<i64>,
}

/// List deployments with optional filters
#[tauri::command]
pub async fn list_deployments(
    filters: Option<DeploymentFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<DeploymentInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let filters = filters.unwrap_or_else(|| DeploymentFilters {
        namespace: None,
        label_selector: None,
        limit: None,
    });

    let namespace = normalize_namespace(filters.namespace, state.get_namespace(&context));

    let mut params = ListParams::default();
    if let Some(labels) = &filters.label_selector {
        params = params.labels(labels);
    }
    if let Some(limit) = filters.limit {
        if limit > 0 {
            params = params.limit(limit as u32);
        }
    }

    let api: kube::Api<k8s_openapi::api::apps::v1::Deployment> = match namespace {
        Some(ref ns) => kube::Api::namespaced((*client).clone(), ns),
        None => kube::Api::all((*client).clone()),
    };
    let list = api.list(&params).await.map_err(|e| e.to_string())?;

    let deployments: Vec<DeploymentInfo> = list.items.iter().map(DeploymentInfo::from).collect();

    Ok(deployments)
}

/// Get a single deployment by name
#[tauri::command]
pub async fn get_deployment(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<DeploymentInfo, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = require_namespace(namespace, state.get_namespace(&context))?;

    let api: kube::Api<k8s_openapi::api::apps::v1::Deployment> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let deployment = api.get(&name).await.map_err(|e| e.to_string())?;

    Ok(DeploymentInfo::from(&deployment))
}

/// Get full deployment YAML
#[tauri::command]
pub async fn get_deployment_yaml(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = require_namespace(namespace, state.get_namespace(&context))?;

    let api: kube::Api<k8s_openapi::api::apps::v1::Deployment> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let deployment = api.get(&name).await.map_err(|e| e.to_string())?;

    serde_yaml::to_string(&deployment).map_err(|e| e.to_string())
}

/// Delete a deployment
#[tauri::command]
pub async fn delete_deployment(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = require_namespace(namespace, state.get_namespace(&context))?;

    let api: kube::Api<k8s_openapi::api::apps::v1::Deployment> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    api.delete(&name, &kube::api::DeleteParams::default())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Scale a deployment
#[tauri::command]
pub async fn scale_deployment(
    name: String,
    replicas: i32,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = require_namespace(namespace, state.get_namespace(&context))?;

    let api: kube::Api<k8s_openapi::api::apps::v1::Deployment> = 
        kube::Api::namespaced((*client).clone(), &namespace);

    let patch = serde_json::json!({
        "spec": {
            "replicas": replicas
        }
    });

    api.patch(&name, &PatchParams::default(), &Patch::Merge(&patch))
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Restart a deployment (rolling restart)
#[tauri::command]
pub async fn restart_deployment(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = require_namespace(namespace, state.get_namespace(&context))?;

    let api: kube::Api<k8s_openapi::api::apps::v1::Deployment> = 
        kube::Api::namespaced((*client).clone(), &namespace);

    // Trigger a rolling restart by updating an annotation
    let now = chrono::Utc::now().to_rfc3339();
    let patch = serde_json::json!({
        "spec": {
            "template": {
                "metadata": {
                    "annotations": {
                        "kubectl.kubernetes.io/restartedAt": now
                    }
                }
            }
        }
    });

    api.patch(&name, &PatchParams::default(), &Patch::Strategic(&patch))
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Update deployment image
#[tauri::command]
pub async fn update_deployment_image(
    name: String,
    container_name: String,
    image: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = require_namespace(namespace, state.get_namespace(&context))?;

    let api: kube::Api<k8s_openapi::api::apps::v1::Deployment> = 
        kube::Api::namespaced((*client).clone(), &namespace);

    // Get current deployment
    let deployment = api.get(&name).await.map_err(|e| e.to_string())?;

    // Find and update the container image
    let mut spec = deployment.spec.ok_or("Deployment has no spec")?;
    let mut template_spec = spec.template.spec.ok_or("Template has no spec")?;

    let container = template_spec
        .containers
        .iter_mut()
        .find(|c| c.name == container_name)
        .ok_or_else(|| format!("Container '{}' not found", container_name))?;

    container.image = Some(image.clone());
    spec.template.spec = Some(template_spec);

    let patch = serde_json::json!({
        "spec": spec
    });

    api.patch(&name, &PatchParams::default(), &Patch::Merge(&patch))
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get deployment pods
#[tauri::command]
pub async fn get_deployment_pods(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<crate::resources::PodInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = require_namespace(namespace, state.get_namespace(&context))?;

    // Get the deployment to find its label selector
    let deploy_api: kube::Api<k8s_openapi::api::apps::v1::Deployment> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let deployment = deploy_api.get(&name).await.map_err(|e| e.to_string())?;

    let selector = deployment
        .spec
        .and_then(|s| s.selector.match_labels)
        .ok_or("Deployment has no selector")?;

    // Build label selector string
    let label_selector: String = selector
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join(",");

    // Get pods matching the selector
    let pod_api: kube::Api<k8s_openapi::api::core::v1::Pod> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let params = ListParams::default().labels(&label_selector);
    let pods = pod_api.list(&params).await.map_err(|e| e.to_string())?;

    let pod_infos: Vec<crate::resources::PodInfo> = pods
        .items
        .iter()
        .map(crate::resources::PodInfo::from)
        .collect();

    Ok(pod_infos)
}

/// Rollout status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RolloutStatus {
    pub replicas: i32,
    pub ready_replicas: i32,
    pub updated_replicas: i32,
    pub available_replicas: i32,
    pub conditions: Vec<DeploymentCondition>,
}

/// Deployment condition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentCondition {
    pub condition_type: String,
    pub status: String,
    pub reason: Option<String>,
    pub message: Option<String>,
}

/// Get deployment rollout status
#[tauri::command]
pub async fn get_rollout_status(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<RolloutStatus, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = require_namespace(namespace, state.get_namespace(&context))?;

    let api: kube::Api<k8s_openapi::api::apps::v1::Deployment> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let deployment = api.get(&name).await.map_err(|e| e.to_string())?;

    let status = deployment.status.ok_or("Deployment has no status")?;

    let conditions: Vec<DeploymentCondition> = status
        .conditions
        .unwrap_or_default()
        .into_iter()
        .map(|c| DeploymentCondition {
            condition_type: c.type_,
            status: c.status,
            reason: c.reason,
            message: c.message,
        })
        .collect();

    Ok(RolloutStatus {
        replicas: status.replicas.unwrap_or(0),
        ready_replicas: status.ready_replicas.unwrap_or(0),
        updated_replicas: status.updated_replicas.unwrap_or(0),
        available_replicas: status.available_replicas.unwrap_or(0),
        conditions,
    })
}
