//! Pod-specific commands

use crate::resources::PodInfo;
use crate::state::AppState;
use crate::utils::{normalize_namespace, require_namespace};
use kube::api::ListParams;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Pod list filters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PodFilters {
    pub namespace: Option<String>,
    pub label_selector: Option<String>,
    pub field_selector: Option<String>,
    pub status_filter: Option<String>,
    pub limit: Option<i64>,
}

/// List pods with optional filters
#[tauri::command]
pub async fn list_pods(
    filters: Option<PodFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<PodInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let filters = filters.unwrap_or_else(|| PodFilters {
        namespace: None,
        label_selector: None,
        field_selector: None,
        status_filter: None,
        limit: None,
    });

    let namespace = normalize_namespace(filters.namespace, state.get_namespace(&context));

    let mut params = ListParams::default();
    if let Some(labels) = &filters.label_selector {
        params = params.labels(labels);
    }
    if let Some(fields) = &filters.field_selector {
        params = params.fields(fields);
    }
    if let Some(limit) = filters.limit {
        if limit > 0 {
            params = params.limit(limit as u32);
        }
    }

    let api: kube::Api<k8s_openapi::api::core::v1::Pod> = match namespace {
        Some(ref ns) => kube::Api::namespaced((*client).clone(), ns),
        None => kube::Api::all((*client).clone()),
    };
    let list = api.list(&params).await.map_err(|e| e.to_string())?;

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
) -> Result<PodInfo, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = require_namespace(namespace, state.get_namespace(&context))?;

    let api: kube::Api<k8s_openapi::api::core::v1::Pod> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let pod = api.get(&name).await.map_err(|e| e.to_string())?;

    Ok(PodInfo::from(&pod))
}

/// Get full pod YAML/JSON
#[tauri::command]
pub async fn get_pod_yaml(
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

    let api: kube::Api<k8s_openapi::api::core::v1::Pod> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let pod = api.get(&name).await.map_err(|e| e.to_string())?;

    serde_yaml::to_string(&pod).map_err(|e| e.to_string())
}

/// Delete a pod
#[tauri::command]
pub async fn delete_pod(
    name: String,
    namespace: Option<String>,
    force: Option<bool>,
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

    let mut dp = kube::api::DeleteParams::default();
    if force.unwrap_or(false) {
        dp = dp.grace_period(0);
    }

    let api: kube::Api<k8s_openapi::api::core::v1::Pod> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    api.delete(&name, &dp).await.map_err(|e| e.to_string())?;

    Ok(())
}

/// Get containers in a pod
#[tauri::command]
pub async fn get_pod_containers(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = require_namespace(namespace, state.get_namespace(&context))?;

    let api: kube::Api<k8s_openapi::api::core::v1::Pod> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let pod = api.get(&name).await.map_err(|e| e.to_string())?;

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
) -> Result<Vec<ContainerStatus>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = require_namespace(namespace, state.get_namespace(&context))?;

    let api: kube::Api<k8s_openapi::api::core::v1::Pod> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let pod = api.get(&name).await.map_err(|e| e.to_string())?;

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
) -> Result<(), String> {
    // Restarting a standalone pod just deletes it
    // For pods managed by controllers, the controller will recreate it
    delete_pod(name, namespace, Some(false), state).await
}
