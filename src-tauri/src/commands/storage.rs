//! Storage-related Tauri commands
//!
//! Commands for managing PersistentVolumes, PersistentVolumeClaims, and StorageClasses.

use crate::commands::helpers::ListContext;
use crate::error::Result;
use crate::state::AppState;
use crate::utils::format_k8s_age;
use k8s_openapi::api::core::v1::{PersistentVolume, PersistentVolumeClaim};
use k8s_openapi::api::storage::v1::StorageClass;
use kube::{api::ListParams, ResourceExt};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tauri::State;

/// Information about a PersistentVolume
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentVolumeInfo {
    pub name: String,
    pub capacity: String,
    pub access_modes: Vec<String>,
    pub reclaim_policy: String,
    pub status: String,
    pub claim: Option<String>,
    pub storage_class: String,
    pub reason: Option<String>,
    pub age: String,
}

/// Information about a PersistentVolumeClaim
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentVolumeClaimInfo {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub volume: Option<String>,
    pub capacity: String,
    pub access_modes: Vec<String>,
    pub storage_class: String,
    pub age: String,
}

/// Information about a StorageClass
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageClassInfo {
    pub name: String,
    pub provisioner: String,
    pub reclaim_policy: String,
    pub volume_binding_mode: String,
    pub allow_volume_expansion: bool,
    pub is_default: bool,
    pub parameters: BTreeMap<String, String>,
    pub age: String,
}

fn format_access_mode(mode: &str) -> String {
    match mode {
        "ReadWriteOnce" => "RWO".to_string(),
        "ReadOnlyMany" => "ROX".to_string(),
        "ReadWriteMany" => "RWX".to_string(),
        "ReadWriteOncePod" => "RWOP".to_string(),
        _ => mode.to_string(),
    }
}

use crate::commands::filters::ResourceFilters;

/// List all PersistentVolumes in the cluster
#[tauri::command]
pub async fn list_persistent_volumes(
    filters: Option<ResourceFilters>,
    state: State<'_, AppState>
) -> Result<Vec<PersistentVolumeInfo>> {
    let filters = filters.unwrap_or_default();
    
    let list = crate::commands::helpers::list_cluster_resources::<PersistentVolume>(
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    ).await?;

    Ok(list
        .into_iter()
        .map(|pv| {
            let spec = pv.spec.as_ref();
            let status = pv.status.as_ref();

            let capacity = spec
                .and_then(|s| s.capacity.as_ref())
                .and_then(|c| c.get("storage"))
                .map(|q| q.0.clone())
                .unwrap_or_else(|| "Unknown".to_string());

            let access_modes = spec
                .and_then(|s| s.access_modes.as_ref())
                .map(|modes| modes.iter().map(|m| format_access_mode(m)).collect())
                .unwrap_or_default();

            let claim = spec.and_then(|s| s.claim_ref.as_ref()).map(|c| {
                format!(
                    "{}/{}",
                    c.namespace.as_deref().unwrap_or(""),
                    c.name.as_deref().unwrap_or("")
                )
            });

            PersistentVolumeInfo {
                name: pv.name_any(),
                capacity,
                access_modes,
                reclaim_policy: spec
                    .and_then(|s| s.persistent_volume_reclaim_policy.clone())
                    .unwrap_or_else(|| "Unknown".to_string()),
                status: status
                    .and_then(|s| s.phase.clone())
                    .unwrap_or_else(|| "Unknown".to_string()),
                claim,
                storage_class: spec
                    .and_then(|s| s.storage_class_name.clone())
                    .unwrap_or_default(),
                reason: status.and_then(|s| s.reason.clone()),
                age: format_k8s_age(pv.metadata.creation_timestamp.as_ref()),
            }
        })
        .collect())
}

/// List PersistentVolumeClaims
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
    ).await?;

    Ok(list
        .into_iter()
        .map(|pvc| {
            let spec = pvc.spec.as_ref();
            let status = pvc.status.as_ref();

            let capacity = status
                .and_then(|s| s.capacity.as_ref())
                .and_then(|c| c.get("storage"))
                .map(|q| q.0.clone())
                .or_else(|| {
                    spec.and_then(|s| s.resources.as_ref())
                        .and_then(|r| r.requests.as_ref())
                        .and_then(|r| r.get("storage"))
                        .map(|q| q.0.clone())
                })
                .unwrap_or_else(|| "Unknown".to_string());

            let access_modes = status
                .and_then(|s| s.access_modes.as_ref())
                .or_else(|| spec.and_then(|s| s.access_modes.as_ref()))
                .map(|modes| modes.iter().map(|m| format_access_mode(m)).collect())
                .unwrap_or_default();

            PersistentVolumeClaimInfo {
                name: pvc.name_any(),
                namespace: pvc.namespace().unwrap_or_default(),
                status: status
                    .and_then(|s| s.phase.clone())
                    .unwrap_or_else(|| "Unknown".to_string()),
                volume: spec.and_then(|s| s.volume_name.clone()),
                capacity,
                access_modes,
                storage_class: spec
                    .and_then(|s| s.storage_class_name.clone())
                    .unwrap_or_default(),
                age: format_k8s_age(pvc.metadata.creation_timestamp.as_ref()),
            }
        })
        .collect())
}

/// List StorageClasses
#[tauri::command]
pub async fn list_storage_classes(
    filters: Option<ResourceFilters>,
    state: State<'_, AppState>
) -> Result<Vec<StorageClassInfo>> {
    let filters = filters.unwrap_or_default();
    
    let list = crate::commands::helpers::list_cluster_resources::<StorageClass>(
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    ).await?;

    Ok(list
        .into_iter()
        .map(|sc| {
            let is_default = sc
                .metadata
                .annotations
                .as_ref()
                .map(|ann| {
                    ann.get("storageclass.kubernetes.io/is-default-class")
                        .or_else(|| ann.get("storageclass.beta.kubernetes.io/is-default-class"))
                        .map(|v| v == "true")
                        .unwrap_or(false)
                })
                .unwrap_or(false);

            StorageClassInfo {
                name: sc.name_any(),
                provisioner: sc.provisioner,
                reclaim_policy: sc.reclaim_policy.unwrap_or_else(|| "Delete".to_string()),
                volume_binding_mode: sc
                    .volume_binding_mode
                    .unwrap_or_else(|| "Immediate".to_string()),
                allow_volume_expansion: sc.allow_volume_expansion.unwrap_or(false),
                is_default,
                parameters: sc.parameters.unwrap_or_default(),
                age: format_k8s_age(sc.metadata.creation_timestamp.as_ref()),
            }
        })
        .collect())
}
