//! Network-related Tauri commands
//!
//! Commands for managing Ingresses and Endpoints.

use crate::error::Result;
use crate::resources::{EndpointsInfo, IngressInfo};
use crate::state::AppState;
use k8s_openapi::api::core::v1::Endpoints;
use k8s_openapi::api::networking::v1::Ingress;
use tauri::State;

use crate::commands::filters::ResourceFilters;

/// List Ingresses
#[tauri::command]
pub async fn list_ingresses(
    filters: Option<ResourceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<IngressInfo>> {
    let filters = filters.unwrap_or_default();

    let list = crate::commands::helpers::list_resources::<Ingress>(
        filters.namespace,
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    )
    .await?;

    Ok(list
        .items
        .iter()
        .map(IngressInfo::from)
        .collect())
}

/// List Endpoints
#[tauri::command]
pub async fn list_endpoints(
    filters: Option<ResourceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<EndpointsInfo>> {
    let filters = filters.unwrap_or_default();

    let list = crate::commands::helpers::list_resources::<Endpoints>(
        filters.namespace,
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    )
    .await?;

    Ok(list
        .items
        .iter()
        .map(EndpointsInfo::from)
        .collect())
}

/// Get a single Ingress by name
#[tauri::command]
pub async fn get_ingress(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<IngressInfo> {
    let ingress: Ingress = crate::commands::helpers::get_resource(name, namespace, state).await?;
    Ok(IngressInfo::from(&ingress))
}

/// Delete an Ingress
#[tauri::command]
pub async fn delete_ingress(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::commands::helpers::delete_resource::<Ingress>(name, namespace, state, None).await
}

/// Get a single Endpoints resource by name
#[tauri::command]
pub async fn get_endpoints(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<EndpointsInfo> {
    let endpoints: Endpoints = crate::commands::helpers::get_resource(name, namespace, state).await?;
    Ok(EndpointsInfo::from(&endpoints))
}

/// Delete an Endpoints resource
#[tauri::command]
pub async fn delete_endpoints(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::commands::helpers::delete_resource::<Endpoints>(name, namespace, state, None).await
}

