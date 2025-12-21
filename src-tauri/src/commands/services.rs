//! Service-specific commands

use crate::resources::ServiceInfo;
use crate::state::AppState;
use crate::utils::{normalize_namespace, require_namespace};
use kube::api::ListParams;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Service list filters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceFilters {
    pub namespace: Option<String>,
    pub label_selector: Option<String>,
    pub service_type: Option<String>,
    pub limit: Option<i64>,
}

/// List services with optional filters
#[tauri::command]
pub async fn list_services(
    filters: Option<ServiceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<ServiceInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let filters = filters.unwrap_or_else(|| ServiceFilters {
        namespace: None,
        label_selector: None,
        service_type: None,
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

    let api: kube::Api<k8s_openapi::api::core::v1::Service> = match namespace {
        Some(ref ns) => kube::Api::namespaced((*client).clone(), ns),
        None => kube::Api::all((*client).clone()),
    };
    let list = api.list(&params).await.map_err(|e| e.to_string())?;

    let mut services: Vec<ServiceInfo> = list.items.iter().map(ServiceInfo::from).collect();

    // Apply type filter if specified
    if let Some(svc_type) = &filters.service_type {
        services.retain(|s| s.type_.eq_ignore_ascii_case(svc_type));
    }

    Ok(services)
}

/// Get a single service by name
#[tauri::command]
pub async fn get_service(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ServiceInfo, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = require_namespace(namespace, state.get_namespace(&context))?;

    let api: kube::Api<k8s_openapi::api::core::v1::Service> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let service = api.get(&name).await.map_err(|e| e.to_string())?;

    Ok(ServiceInfo::from(&service))
}

/// Get full service YAML
#[tauri::command]
pub async fn get_service_yaml(
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

    let api: kube::Api<k8s_openapi::api::core::v1::Service> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let service = api.get(&name).await.map_err(|e| e.to_string())?;

    serde_yaml::to_string(&service).map_err(|e| e.to_string())
}

/// Delete a service
#[tauri::command]
pub async fn delete_service(
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

    let api: kube::Api<k8s_openapi::api::core::v1::Service> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    api.delete(&name, &kube::api::DeleteParams::default())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Service endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointInfo {
    pub ip: String,
    pub port: i32,
    pub protocol: String,
    pub node_name: Option<String>,
    pub target_ref: Option<EndpointTarget>,
}

/// Endpoint target reference
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointTarget {
    pub kind: String,
    pub name: String,
    pub namespace: Option<String>,
}

/// Get service endpoints
#[tauri::command]
pub async fn get_service_endpoints(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<EndpointInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = require_namespace(namespace, state.get_namespace(&context))?;

    let api: kube::Api<k8s_openapi::api::core::v1::Endpoints> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    
    let endpoints = match api.get(&name).await {
        Ok(ep) => ep,
        Err(_) => return Ok(vec![]), // No endpoints found
    };

    let mut result = Vec::new();

    for subset in endpoints.subsets.unwrap_or_default() {
        let ports = subset.ports.unwrap_or_default();
        for address in subset.addresses.unwrap_or_default() {
            for port in &ports {
                result.push(EndpointInfo {
                    ip: address.ip.clone(),
                    port: port.port,
                    protocol: port.protocol.clone().unwrap_or_else(|| "TCP".to_string()),
                    node_name: address.node_name.clone(),
                    target_ref: address.target_ref.as_ref().map(|tr| EndpointTarget {
                        kind: tr.kind.clone().unwrap_or_default(),
                        name: tr.name.clone().unwrap_or_default(),
                        namespace: tr.namespace.clone(),
                    }),
                });
            }
        }
    }

    Ok(result)
}

/// Get pods backing a service
#[tauri::command]
pub async fn get_service_pods(
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

    // Get the service to find its selector
    let svc_api: kube::Api<k8s_openapi::api::core::v1::Service> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let service = svc_api.get(&name).await.map_err(|e| e.to_string())?;

    let selector = service
        .spec
        .and_then(|s| s.selector)
        .ok_or("Service has no selector")?;

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

/// Port forward configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortForwardConfig {
    pub local_port: u16,
    pub remote_port: u16,
}

/// Start port forwarding to a service
#[tauri::command]
pub async fn port_forward_service(
    name: String,
    config: PortForwardConfig,
    namespace: Option<String>,
    _state: State<'_, AppState>,
) -> Result<String, String> {
    // TODO: Implement port forwarding
    // This requires spawning a background task that maintains
    // the port forward connection
    Err(format!(
        "Port forwarding to service {} ({}:{}) not yet implemented",
        name, config.local_port, config.remote_port
    ))
}

/// Stop service port forwarding
#[tauri::command]
pub async fn stop_service_port_forward(
    forward_id: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    // TODO: Implement stopping port forward
    Err(format!("Stop port forward {} not yet implemented", forward_id))
}
