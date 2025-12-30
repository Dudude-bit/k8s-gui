//! Pod-specific commands

use k8s_openapi::api::core::v1::Pod;
use tauri::State;

use crate::commands::filters::PodFilters;
use crate::commands::helpers::CommandContext;
use crate::error::Result;
use crate::resources::PodInfo;
use crate::state::AppState;

/// List pods with optional filters
#[tauri::command]
pub async fn list_pods(
    filters: Option<PodFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<PodInfo>> {
    let filters = filters.unwrap_or_default();

    let list = crate::commands::helpers::list_resources::<Pod>(
        filters.namespace,
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    )
    .await?;

    let mut pods: Vec<PodInfo> = list.items.iter().map(PodInfo::from).collect();

    // Apply status filter if specified
    if let Some(status) = &filters.status_filter {
        pods.retain(|p| p.status.phase.eq_ignore_ascii_case(status));
    }

    Ok(pods)
}

/// Get a single pod by name
#[tauri::command]
pub async fn get_pod(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<PodInfo> {
    crate::validation::validate_resource_name(&name)?;
    let pod: Pod = crate::commands::helpers::get_resource(name, namespace, state).await?;
    Ok(PodInfo::from(&pod))
}

/// Get full pod YAML/JSON
#[tauri::command]
pub async fn get_pod_yaml(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    crate::commands::helpers::get_resource_yaml::<Pod>(name, namespace, state).await
}

/// Delete a pod
#[tauri::command]
pub async fn delete_pod(
    name: String,
    namespace: Option<String>,
    force: Option<bool>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::validation::validate_resource_name(&name)?;

    let ctx = CommandContext::new(&state, namespace)?;
    crate::validation::validate_namespace(&ctx.namespace)?;

    let mut dp = kube::api::DeleteParams::default();
    if force.unwrap_or(false) {
        dp = dp.grace_period(0);
    }

    let api: kube::Api<Pod> = ctx.namespaced_api();
    api.delete(&name, &dp).await?;

    Ok(())
}

/// Restart a pod (delete and let the controller recreate it)
#[tauri::command]
pub async fn restart_pod(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    // Restarting a standalone pod just deletes it
    // For pods managed by controllers, the controller will recreate it
    delete_pod(name, namespace, Some(false), state).await
}
