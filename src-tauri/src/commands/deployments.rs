//! Deployment-specific commands

use crate::commands::filters::DeploymentFilters;
use crate::commands::helpers::{build_list_params, CommandContext, ListContext};
use crate::error::Result;
use crate::resources::{DeploymentInfo, PodInfo};
use crate::state::AppState;
use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::Pod;
use kube::api::{Patch, PatchParams};
use serde::{Deserialize, Serialize};
use tauri::State;

/// List deployments with optional filters
#[tauri::command]
pub async fn list_deployments(
    filters: Option<DeploymentFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<DeploymentInfo>> {
    let filters = filters.unwrap_or_default();
    let ctx = ListContext::new(&state, filters.namespace)?;
    let params = build_list_params(
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    );

    let api: kube::Api<Deployment> = ctx.api();
    let list = api.list(&params).await?;

    Ok(list.items.iter().map(DeploymentInfo::from).collect())
}

/// Get a single deployment by name
#[tauri::command]
pub async fn get_deployment(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<DeploymentInfo> {
    crate::validation::validate_resource_name(&name)?;
    
    let ctx = CommandContext::new(&state, namespace)?;
    crate::validation::validate_namespace(&ctx.namespace)?;

    let api: kube::Api<Deployment> = ctx.namespaced_api();
    let deployment = api.get(&name).await?;

    Ok(DeploymentInfo::from(&deployment))
}

/// Get full deployment YAML
#[tauri::command]
pub async fn get_deployment_yaml(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    super::helpers::get_resource_yaml::<Deployment>(name, namespace, state).await
}

/// Delete a deployment
#[tauri::command]
pub async fn delete_deployment(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::validation::validate_resource_name(&name)?;
    
    let ctx = CommandContext::new(&state, namespace)?;
    crate::validation::validate_namespace(&ctx.namespace)?;

    let api: kube::Api<Deployment> = ctx.namespaced_api();
    api.delete(&name, &kube::api::DeleteParams::default()).await?;

    Ok(())
}

/// Scale a deployment
#[tauri::command]
pub async fn scale_deployment(
    name: String,
    replicas: i32,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    let ctx = CommandContext::new(&state, namespace)?;

    let api: kube::Api<Deployment> = ctx.namespaced_api();

    let patch = serde_json::json!({
        "spec": {
            "replicas": replicas
        }
    });

    api.patch(&name, &PatchParams::default(), &Patch::Merge(&patch)).await?;

    Ok(())
}

/// Restart a deployment (rolling restart)
#[tauri::command]
pub async fn restart_deployment(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    let ctx = CommandContext::new(&state, namespace)?;

    let api: kube::Api<Deployment> = ctx.namespaced_api();

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

    api.patch(&name, &PatchParams::default(), &Patch::Strategic(&patch)).await?;

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
) -> Result<()> {
    let ctx = CommandContext::new(&state, namespace)?;

    let api: kube::Api<Deployment> = ctx.namespaced_api();

    // Get current deployment
    let deployment = api.get(&name).await?;

    // Find and update the container image
    let mut spec = deployment.spec.ok_or_else(|| {
        crate::error::Error::InvalidInput("Deployment has no spec".to_string())
    })?;
    let mut template_spec = spec.template.spec.ok_or_else(|| {
        crate::error::Error::InvalidInput("Template has no spec".to_string())
    })?;

    let container = template_spec
        .containers
        .iter_mut()
        .find(|c| c.name == container_name)
        .ok_or_else(|| {
            crate::error::Error::InvalidInput(format!("Container '{}' not found", container_name))
        })?;

    container.image = Some(image.clone());
    spec.template.spec = Some(template_spec);

    let patch = serde_json::json!({
        "spec": spec
    });

    api.patch(&name, &PatchParams::default(), &Patch::Merge(&patch)).await?;

    Ok(())
}

/// Get deployment pods
#[tauri::command]
pub async fn get_deployment_pods(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<PodInfo>> {
    let ctx = CommandContext::new(&state, namespace)?;

    // Get the deployment to find its label selector
    let deploy_api: kube::Api<Deployment> = ctx.namespaced_api();
    let deployment = deploy_api.get(&name).await?;

    let selector = deployment
        .spec
        .and_then(|s| s.selector.match_labels)
        .ok_or_else(|| crate::error::Error::InvalidInput("Deployment has no selector".to_string()))?;

    // Build label selector string
    let label_selector: String = selector
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join(",");

    // Get pods matching the selector
    let pod_api: kube::Api<Pod> = ctx.namespaced_api();
    let params = kube::api::ListParams::default().labels(&label_selector);
    let pods = pod_api.list(&params).await?;

    let pod_infos: Vec<PodInfo> = pods
        .items
        .iter()
        .map(PodInfo::from)
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
) -> Result<RolloutStatus> {
    let ctx = CommandContext::new(&state, namespace)?;

    let api: kube::Api<Deployment> = ctx.namespaced_api();
    let deployment = api.get(&name).await?;

    let status = deployment.status.ok_or_else(|| {
        crate::error::Error::InvalidInput("Deployment has no status".to_string())
    })?;

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
