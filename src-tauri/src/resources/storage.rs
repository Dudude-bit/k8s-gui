//! Storage resource types

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Information about a `PersistentVolume`
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

/// Information about a `PersistentVolumeClaim`
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

/// Information about a `StorageClass`
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
