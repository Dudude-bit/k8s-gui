//! Common filter structures for resource commands
//!
//! Provides unified filter structures for listing Kubernetes resources.

use serde::{Deserialize, Serialize};

/// Base filters for Kubernetes resources
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResourceFilters {
    pub namespace: Option<String>,
    pub label_selector: Option<String>,
    pub field_selector: Option<String>,
    pub limit: Option<i64>,
}

/// Pod-specific filters
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PodFilters {
    #[serde(flatten)]
    pub base: ResourceFilters,
    pub status_filter: Option<String>,
}

// Implement Deref to allow accessing base fields directly
impl std::ops::Deref for PodFilters {
    type Target = ResourceFilters;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

/// Service-specific filters
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ServiceFilters {
    #[serde(flatten)]
    pub base: ResourceFilters,
    pub service_type: Option<String>,
}

impl std::ops::Deref for ServiceFilters {
    type Target = ResourceFilters;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

/// Secret-specific filters
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SecretFilters {
    #[serde(flatten)]
    pub base: ResourceFilters,
    pub secret_type: Option<String>,
}

impl std::ops::Deref for SecretFilters {
    type Target = ResourceFilters;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}
