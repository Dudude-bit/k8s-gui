//! Storage-related Tauri commands
//!
//! Commands for managing `PersistentVolumes`, `PersistentVolumeClaims`, and `StorageClasses`.

use crate::error::Result;
use crate::resources::{PersistentVolumeClaimInfo, PersistentVolumeInfo, StorageClassInfo};
use crate::state::AppState;

use k8s_openapi::api::core::v1::{PersistentVolume, PersistentVolumeClaim};
use k8s_openapi::api::storage::v1::StorageClass;
use tauri::State;

use crate::commands::filters::ResourceFilters;

/// List all `PersistentVolumes` in the cluster
#[tauri::command]
pub async fn list_persistent_volumes(
    filters: Option<ResourceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<PersistentVolumeInfo>> {
    let filters = filters.unwrap_or_default();

    let list = crate::commands::helpers::list_cluster_resources::<PersistentVolume>(
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    )
    .await?;

    Ok(list
        .items
        .iter()
        .map(PersistentVolumeInfo::from)
        .collect())
}

/// List `PersistentVolumeClaims`
#[tauri::command]
pub async fn list_persistent_volume_claims(
    filters: Option<ResourceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<PersistentVolumeClaimInfo>> {
    let filters = filters.unwrap_or_default();

    let list = crate::commands::helpers::list_resources::<PersistentVolumeClaim>(
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
        .map(PersistentVolumeClaimInfo::from)
        .collect())
}

/// List `StorageClasses`
#[tauri::command]
pub async fn list_storage_classes(
    filters: Option<ResourceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<StorageClassInfo>> {
    let filters = filters.unwrap_or_default();

    let list = crate::commands::helpers::list_cluster_resources::<StorageClass>(
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    )
    .await?;

    Ok(list
        .items
        .iter()
        .map(StorageClassInfo::from)
        .collect())
}

/// Get a single PersistentVolume by name
#[tauri::command]
pub async fn get_persistent_volume(
    name: String,
    state: State<'_, AppState>,
) -> Result<PersistentVolumeInfo> {
    let pv: PersistentVolume = crate::commands::helpers::get_cluster_resource(name, state).await?;
    Ok(PersistentVolumeInfo::from(&pv))
}

/// Delete a PersistentVolume
#[tauri::command]
pub async fn delete_persistent_volume(
    name: String,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::commands::helpers::delete_cluster_resource::<PersistentVolume>(name, state, None).await
}

/// Get a single PersistentVolumeClaim by name
#[tauri::command]
pub async fn get_persistent_volume_claim(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<PersistentVolumeClaimInfo> {
    let pvc: PersistentVolumeClaim = crate::commands::helpers::get_resource(name, namespace, state).await?;
    Ok(PersistentVolumeClaimInfo::from(&pvc))
}

/// Delete a PersistentVolumeClaim
#[tauri::command]
pub async fn delete_persistent_volume_claim(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::commands::helpers::delete_resource::<PersistentVolumeClaim>(name, namespace, state, None).await
}

/// Get a single StorageClass by name
#[tauri::command]
pub async fn get_storage_class(
    name: String,
    state: State<'_, AppState>,
) -> Result<StorageClassInfo> {
    let sc: StorageClass = crate::commands::helpers::get_cluster_resource(name, state).await?;
    Ok(StorageClassInfo::from(&sc))
}

/// Delete a StorageClass
#[tauri::command]
pub async fn delete_storage_class(
    name: String,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::commands::helpers::delete_cluster_resource::<StorageClass>(name, state, None).await
}

