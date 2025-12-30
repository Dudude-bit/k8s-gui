//! Service-specific commands

use k8s_openapi::api::core::v1::{Endpoints, Pod, Service};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::filters::ServiceFilters;
use crate::commands::helpers::CommandContext;
use crate::error::Result;
use crate::resources::{PodInfo, ServiceInfo};
use crate::state::AppState;

/// List services with optional filters
#[tauri::command]
pub async fn list_services(
    filters: Option<ServiceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<ServiceInfo>> {
    let filters = filters.unwrap_or_default();

    let list = crate::commands::helpers::list_resources::<Service>(
        filters.namespace,
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    )
    .await?;

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
    let service: Service = crate::commands::helpers::get_resource(name, namespace, state).await?;
    Ok(ServiceInfo::from(&service))
}

/// Get full service YAML
#[tauri::command]
pub async fn get_service_yaml(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    crate::commands::helpers::get_resource_yaml::<Service>(name, namespace, state).await
}

/// Delete a service
#[tauri::command]
pub async fn delete_service(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::commands::helpers::delete_resource::<Service>(name, namespace, state, None).await
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
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join(",");

    // Get pods matching the selector
    let pod_api: kube::Api<Pod> = ctx.namespaced_api();
    let params = kube::api::ListParams::default().labels(&label_selector);
    let pods = pod_api.list(&params).await?;

    let pod_infos: Vec<PodInfo> = pods.items.iter().map(PodInfo::from).collect();

    Ok(pod_infos)
}
