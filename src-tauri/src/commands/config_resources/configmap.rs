//! `ConfigMap` commands — list / get / get-data / delete.

use crate::commands::filters::ResourceFilters;
use crate::commands::helpers::{get_resource_info, list_resource_infos};
use crate::error::Result;
use crate::resources::ConfigMapInfo;
use crate::state::AppState;
use k8s_openapi::api::core::v1::ConfigMap;
use std::collections::BTreeMap;
use tauri::State;

/// List `ConfigMaps`
#[tauri::command]
pub async fn list_configmaps(
    filters: Option<ResourceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<ConfigMapInfo>> {
    list_resource_infos::<ConfigMap, ConfigMapInfo>(filters, state).await
}

/// Get a `ConfigMap` by name
#[tauri::command]
pub async fn get_configmap(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ConfigMapInfo> {
    crate::validation::validate_dns_subdomain(&name)?;
    get_resource_info::<ConfigMap, ConfigMapInfo>(name, namespace, state).await
}

/// Get `ConfigMap` data
#[tauri::command]
pub async fn get_configmap_data(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<BTreeMap<String, String>> {
    crate::validation::validate_dns_subdomain(&name)?;
    let configmap: ConfigMap =
        crate::commands::helpers::get_resource(name, namespace, state).await?;
    Ok(configmap.data.unwrap_or_default())
}

/// Delete `ConfigMap`
#[tauri::command]
pub async fn delete_configmap(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::validation::validate_dns_subdomain(&name)?;
    crate::commands::helpers::delete_resource::<ConfigMap>(name, namespace, state, None).await
}
