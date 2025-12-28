//! Common filter structures for resource commands

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

/// Pod-specific filters (extends ResourceFilters)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PodFilters {
    pub namespace: Option<String>,
    pub label_selector: Option<String>,
    pub field_selector: Option<String>,
    pub limit: Option<i64>,
    pub status_filter: Option<String>,
}

impl From<ResourceFilters> for PodFilters {
    fn from(base: ResourceFilters) -> Self {
        PodFilters {
            namespace: base.namespace,
            label_selector: base.label_selector,
            field_selector: base.field_selector,
            limit: base.limit,
            status_filter: None,
        }
    }
}

/// Deployment-specific filters (extends ResourceFilters)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentFilters {
    pub namespace: Option<String>,
    pub label_selector: Option<String>,
    pub field_selector: Option<String>,
    pub limit: Option<i64>,
}

impl From<ResourceFilters> for DeploymentFilters {
    fn from(base: ResourceFilters) -> Self {
        DeploymentFilters {
            namespace: base.namespace,
            label_selector: base.label_selector,
            field_selector: base.field_selector,
            limit: base.limit,
        }
    }
}

/// Service-specific filters (extends ResourceFilters)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ServiceFilters {
    pub namespace: Option<String>,
    pub label_selector: Option<String>,
    pub field_selector: Option<String>,
    pub limit: Option<i64>,
    pub service_type: Option<String>,
}

impl From<ResourceFilters> for ServiceFilters {
    fn from(base: ResourceFilters) -> Self {
        ServiceFilters {
            namespace: base.namespace,
            label_selector: base.label_selector,
            field_selector: base.field_selector,
            limit: base.limit,
            service_type: None,
        }
    }
}

