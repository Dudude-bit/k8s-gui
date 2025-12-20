//! Storage-related Tauri commands
//! 
//! Commands for managing PersistentVolumes, PersistentVolumeClaims, and StorageClasses.

use crate::state::AppState;
use k8s_openapi::api::core::v1::{PersistentVolume, PersistentVolumeClaim};
use k8s_openapi::api::storage::v1::StorageClass;
use kube::{Api, api::ListParams, ResourceExt};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tauri::State;

/// Information about a PersistentVolume
#[derive(Debug, Clone, Serialize, Deserialize)]
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

fn format_age(created: Option<&k8s_openapi::apimachinery::pkg::apis::meta::v1::Time>) -> String {
    match created {
        Some(time) => {
            let now = chrono::Utc::now();
            let created_time = chrono::DateTime::parse_from_rfc3339(&time.0.to_rfc3339())
                .map(|t| t.with_timezone(&chrono::Utc))
                .unwrap_or(now);
            let duration = now.signed_duration_since(created_time);
            
            if duration.num_days() > 0 {
                format!("{}d", duration.num_days())
            } else if duration.num_hours() > 0 {
                format!("{}h", duration.num_hours())
            } else if duration.num_minutes() > 0 {
                format!("{}m", duration.num_minutes())
            } else {
                format!("{}s", duration.num_seconds())
            }
        }
        None => "Unknown".to_string(),
    }
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

/// List all PersistentVolumes in the cluster
#[tauri::command]
pub async fn list_persistent_volumes(
    state: State<'_, AppState>,
) -> Result<Vec<PersistentVolumeInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;
    
    let pvs: Api<PersistentVolume> = Api::all((*client).clone());
    let pv_list = pvs.list(&ListParams::default()).await.map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for pv in pv_list {
        let spec = pv.spec.as_ref();
        let status = pv.status.as_ref();
        
        // Get capacity
        let capacity = spec
            .and_then(|s| s.capacity.as_ref())
            .and_then(|c| c.get("storage"))
            .map(|q| q.0.clone())
            .unwrap_or_else(|| "Unknown".to_string());
        
        // Get access modes
        let access_modes = spec
            .and_then(|s| s.access_modes.as_ref())
            .map(|modes| modes.iter().map(|m| format_access_mode(m)).collect())
            .unwrap_or_default();
        
        // Get claim reference
        let claim = spec
            .and_then(|s| s.claim_ref.as_ref())
            .map(|c| format!("{}/{}", c.namespace.as_deref().unwrap_or(""), c.name.as_deref().unwrap_or("")));
        
        result.push(PersistentVolumeInfo {
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
            age: format_age(pv.metadata.creation_timestamp.as_ref()),
        });
    }
    
    Ok(result)
}

/// List PersistentVolumeClaims
#[tauri::command]
pub async fn list_persistent_volume_claims(
    state: State<'_, AppState>,
    namespace: Option<String>,
) -> Result<Vec<PersistentVolumeClaimInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let ns = namespace.unwrap_or_else(|| state.get_namespace(&context));
    
    let pvcs: Api<PersistentVolumeClaim> = Api::namespaced((*client).clone(), &ns);
    let pvc_list = pvcs.list(&ListParams::default()).await.map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for pvc in pvc_list {
        let spec = pvc.spec.as_ref();
        let status = pvc.status.as_ref();
        
        // Get capacity from status (actual) or spec (requested)
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
        
        // Get access modes
        let access_modes = status
            .and_then(|s| s.access_modes.as_ref())
            .or_else(|| spec.and_then(|s| s.access_modes.as_ref()))
            .map(|modes| modes.iter().map(|m| format_access_mode(m)).collect())
            .unwrap_or_default();
        
        result.push(PersistentVolumeClaimInfo {
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
            age: format_age(pvc.metadata.creation_timestamp.as_ref()),
        });
    }
    
    Ok(result)
}

/// List StorageClasses
#[tauri::command]
pub async fn list_storage_classes(
    state: State<'_, AppState>,
) -> Result<Vec<StorageClassInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;
    
    let scs: Api<StorageClass> = Api::all((*client).clone());
    let sc_list = scs.list(&ListParams::default()).await.map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for sc in sc_list {
        // Check if this is the default storage class
        let is_default = sc.metadata.annotations.as_ref()
            .map(|ann| {
                ann.get("storageclass.kubernetes.io/is-default-class")
                    .or_else(|| ann.get("storageclass.beta.kubernetes.io/is-default-class"))
                    .map(|v| v == "true")
                    .unwrap_or(false)
            })
            .unwrap_or(false);
        
        result.push(StorageClassInfo {
            name: sc.name_any(),
            provisioner: sc.provisioner,
            reclaim_policy: sc.reclaim_policy.unwrap_or_else(|| "Delete".to_string()),
            volume_binding_mode: sc.volume_binding_mode.unwrap_or_else(|| "Immediate".to_string()),
            allow_volume_expansion: sc.allow_volume_expansion.unwrap_or(false),
            is_default,
            parameters: sc.parameters.unwrap_or_default(),
            age: format_age(sc.metadata.creation_timestamp.as_ref()),
        });
    }
    
    Ok(result)
}
