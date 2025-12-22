//! Pod-specific commands

use crate::commands::filters::PodFilters;
use crate::commands::helpers::{build_list_params, CommandContext, ListContext};
use crate::error::Result;
use crate::resources::PodInfo;
use crate::state::AppState;
use k8s_openapi::api::core::v1::Pod;
use serde::{Deserialize, Serialize};
use tauri::State;

/// List pods with optional filters
#[tauri::command]
pub async fn list_pods(
    filters: Option<PodFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<PodInfo>> {
    let filters = filters.unwrap_or_default();
    let ctx = ListContext::new(&state, filters.namespace)?;
    let params = build_list_params(
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    );

    let api: kube::Api<Pod> = ctx.api();
    let list = api.list(&params).await?;

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
    
    let ctx = CommandContext::new(&state, namespace)?;
    crate::validation::validate_namespace(&ctx.namespace)?;

    let api: kube::Api<Pod> = ctx.namespaced_api();
    let pod = api.get(&name).await?;

    Ok(PodInfo::from(&pod))
}

/// Get full pod YAML/JSON
#[tauri::command]
pub async fn get_pod_yaml(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    super::helpers::get_resource_yaml::<Pod>(name, namespace, state).await
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

/// Get containers in a pod
#[tauri::command]
pub async fn get_pod_containers(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<String>> {
    let ctx = CommandContext::new(&state, namespace)?;

    let api: kube::Api<Pod> = ctx.namespaced_api();
    let pod = api.get(&name).await?;

    let containers: Vec<String> = pod
        .spec
        .map(|s| s.containers.into_iter().map(|c| c.name).collect())
        .unwrap_or_default();

    Ok(containers)
}

/// Container status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerStatus {
    pub name: String,
    pub ready: bool,
    pub restart_count: i32,
    pub state: String,
    pub started: bool,
    pub image: String,
}

/// Get container statuses for a pod
#[tauri::command]
pub async fn get_container_statuses(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<ContainerStatus>> {
    let ctx = CommandContext::new(&state, namespace)?;

    let api: kube::Api<Pod> = ctx.namespaced_api();
    let pod = api.get(&name).await?;

    let statuses: Vec<ContainerStatus> = pod
        .status
        .and_then(|s| s.container_statuses)
        .map(|cs| {
            cs.into_iter()
                .map(|c| {
                    let state_str = if c.state.as_ref().and_then(|s| s.running.as_ref()).is_some() {
                        "Running"
                    } else if c.state.as_ref().and_then(|s| s.waiting.as_ref()).is_some() {
                        "Waiting"
                    } else if c.state.as_ref().and_then(|s| s.terminated.as_ref()).is_some() {
                        "Terminated"
                    } else {
                        "Unknown"
                    };

                    ContainerStatus {
                        name: c.name,
                        ready: c.ready,
                        restart_count: c.restart_count,
                        state: state_str.to_string(),
                        started: c.started.unwrap_or(false),
                        image: c.image,
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(statuses)
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
