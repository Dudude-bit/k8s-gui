//! Service-specific commands

use crate::commands::filters::ServiceFilters;
use crate::commands::helpers::{build_list_params, CommandContext, ListContext};
use crate::error::Result;
use crate::resources::{PodInfo, ServiceInfo};
use crate::state::AppState;
use k8s_openapi::api::core::v1::{Endpoints, Pod, Service};
use serde::{Deserialize, Serialize};
use tauri::State;

/// List services with optional filters
#[tauri::command]
pub async fn list_services(
    filters: Option<ServiceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<ServiceInfo>> {
    let filters = filters.unwrap_or_default();
    let ctx = ListContext::new(&state, filters.namespace)?;
    let params = build_list_params(
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    );

    // Use namespaced API when namespace is provided for proper filtering
    let api: kube::Api<Service> = if ctx.namespace.is_some() {
        ctx.namespaced_api()
    } else {
        ctx.api()
    };
    let list = api.list(&params).await?;

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
) -> Result<ServiceInfo> {
    let ctx = CommandContext::new(&state, namespace)?;

    let api: kube::Api<Service> = ctx.namespaced_api();
    let service = api.get(&name).await?;

    Ok(ServiceInfo::from(&service))
}

/// Get full service YAML
#[tauri::command]
pub async fn get_service_yaml(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    super::helpers::get_resource_yaml::<Service>(name, namespace, state).await
}

/// Delete a service
#[tauri::command]
pub async fn delete_service(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    super::helpers::delete_resource::<Service>(name, namespace, state, None).await
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
) -> Result<Vec<EndpointInfo>> {
    let ctx = CommandContext::new(&state, namespace)?;

    let api: kube::Api<Endpoints> = ctx.namespaced_api();
    
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
) -> Result<Vec<PodInfo>> {
    let ctx = CommandContext::new(&state, namespace)?;

    // Get the service to find its selector
    let svc_api: kube::Api<Service> = ctx.namespaced_api();
    let service = svc_api.get(&name).await?;

    let selector = service
        .spec
        .and_then(|s| s.selector)
        .ok_or_else(|| crate::error::Error::InvalidInput("Service has no selector".to_string()))?;

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
) -> Result<String> {
    // TODO: Implement port forwarding
    // This requires spawning a background task that maintains
    // the port forward connection
    Err(crate::error::Error::Internal(format!(
        "Port forwarding to service {} ({}:{}) not yet implemented",
        name, config.local_port, config.remote_port
    )))
}

/// Stop service port forwarding
#[tauri::command]
pub async fn stop_service_port_forward(
    forward_id: String,
    _state: State<'_, AppState>,
) -> Result<()> {
    // TODO: Implement stopping port forward
    Err(crate::error::Error::Internal(format!(
        "Stop port forward {} not yet implemented",
        forward_id
    )))
}
