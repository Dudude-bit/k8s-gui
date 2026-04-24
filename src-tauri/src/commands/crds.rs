//! CRD (Custom Resource Definition) commands
//!
//! Commands for managing CRDs and custom resource instances.

use crate::commands::helpers::{build_list_params, ResourceContext};
use crate::error::{Error, Result};
use crate::state::AppState;
use chrono::{DateTime, Utc};
use k8s_openapi::apiextensions_apiserver::pkg::apis::apiextensions::v1::CustomResourceDefinition;
use kube::api::{Api, DeleteParams, DynamicObject};
use kube::discovery::ApiResource;
use kube::ResourceExt;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tauri::State;

// =============================================================================
// Types
// =============================================================================

/// CRD information for list view
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrdInfo {
    pub name: String,
    pub group: String,
    pub kind: String,
    pub plural: String,
    pub scope: String,
    pub version: String,
    pub short_names: Vec<String>,
    pub categories: Vec<String>,
    pub created_at: Option<DateTime<Utc>>,
}

/// CRD group for grouped list view
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrdGroup {
    pub group: String,
    pub crds: Vec<CrdInfo>,
}

/// CRD version information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrdVersionInfo {
    pub name: String,
    pub served: bool,
    pub storage: bool,
    pub deprecated: bool,
    pub deprecation_warning: Option<String>,
    pub schema: Option<serde_json::Value>,
    pub additional_printer_columns: Vec<PrinterColumn>,
}

/// Printer column definition from CRD
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterColumn {
    pub name: String,
    pub column_type: String,
    pub json_path: String,
    pub description: Option<String>,
    pub priority: Option<i32>,
}

/// CRD condition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrdCondition {
    pub condition_type: String,
    pub status: String,
    pub reason: Option<String>,
    pub message: Option<String>,
    pub last_transition_time: Option<DateTime<Utc>>,
}

/// CRD detail information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrdDetailInfo {
    pub name: String,
    pub group: String,
    pub kind: String,
    pub plural: String,
    pub singular: String,
    pub scope: String,
    pub versions: Vec<CrdVersionInfo>,
    pub short_names: Vec<String>,
    pub categories: Vec<String>,
    pub labels: BTreeMap<String, String>,
    pub annotations: BTreeMap<String, String>,
    pub conditions: Vec<CrdCondition>,
    pub created_at: Option<DateTime<Utc>>,
    pub accepted_names: CrdAcceptedNames,
}

/// CRD accepted names
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrdAcceptedNames {
    pub kind: String,
    pub plural: String,
    pub singular: Option<String>,
    pub short_names: Vec<String>,
    pub categories: Vec<String>,
    pub list_kind: Option<String>,
}

/// Custom resource instance information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomResourceInfo {
    pub name: String,
    pub namespace: Option<String>,
    pub uid: String,
    pub api_version: String,
    pub kind: String,
    pub spec: serde_json::Value,
    pub status: Option<serde_json::Value>,
    pub labels: BTreeMap<String, String>,
    pub annotations: BTreeMap<String, String>,
    pub created_at: Option<DateTime<Utc>>,
    pub owner_references: Vec<OwnerReferenceInfo>,
}

/// Owner reference information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnerReferenceInfo {
    pub api_version: String,
    pub kind: String,
    pub name: String,
    pub uid: String,
    pub controller: Option<bool>,
}

/// Custom resource detail with full data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomResourceDetailInfo {
    pub name: String,
    pub namespace: Option<String>,
    pub uid: String,
    pub api_version: String,
    pub kind: String,
    pub spec: serde_json::Value,
    pub status: Option<serde_json::Value>,
    pub labels: BTreeMap<String, String>,
    pub annotations: BTreeMap<String, String>,
    pub created_at: Option<DateTime<Utc>>,
    pub owner_references: Vec<OwnerReferenceInfo>,
    pub finalizers: Vec<String>,
    pub resource_version: Option<String>,
}

// =============================================================================
// Conversion implementations
// =============================================================================

impl From<&CustomResourceDefinition> for CrdInfo {
    fn from(crd: &CustomResourceDefinition) -> Self {
        let spec = &crd.spec;
        let names = &spec.names;

        // Find storage version
        let storage_version = spec
            .versions
            .iter()
            .find(|v| v.storage)
            .map(|v| v.name.clone())
            .unwrap_or_else(|| {
                spec.versions
                    .first()
                    .map(|v| v.name.clone())
                    .unwrap_or_default()
            });

        CrdInfo {
            name: crd.name_any(),
            group: spec.group.clone(),
            kind: names.kind.clone(),
            plural: names.plural.clone(),
            scope: spec.scope.clone(),
            version: storage_version,
            short_names: names.short_names.clone().unwrap_or_default(),
            categories: names.categories.clone().unwrap_or_default(),
            created_at: crd.creation_timestamp().map(|t| t.0),
        }
    }
}

impl From<&CustomResourceDefinition> for CrdDetailInfo {
    fn from(crd: &CustomResourceDefinition) -> Self {
        let spec = &crd.spec;
        let names = &spec.names;
        let status = crd.status.as_ref();

        let versions: Vec<CrdVersionInfo> = spec
            .versions
            .iter()
            .map(|v| {
                let schema = v
                    .schema
                    .as_ref()
                    .and_then(|s| s.open_api_v3_schema.as_ref())
                    .and_then(|s| serde_json::to_value(s).ok());

                let columns: Vec<PrinterColumn> = v
                    .additional_printer_columns
                    .as_ref()
                    .map(|cols| {
                        cols.iter()
                            .map(|c| PrinterColumn {
                                name: c.name.clone(),
                                column_type: c.type_.clone(),
                                json_path: c.json_path.clone(),
                                description: c.description.clone(),
                                priority: c.priority,
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                CrdVersionInfo {
                    name: v.name.clone(),
                    served: v.served,
                    storage: v.storage,
                    deprecated: v.deprecated.unwrap_or(false),
                    deprecation_warning: v.deprecation_warning.clone(),
                    schema,
                    additional_printer_columns: columns,
                }
            })
            .collect();

        let conditions: Vec<CrdCondition> = status
            .and_then(|s| s.conditions.as_ref())
            .map(|conds| {
                conds
                    .iter()
                    .map(|c| CrdCondition {
                        condition_type: c.type_.clone(),
                        status: c.status.clone(),
                        reason: c.reason.clone(),
                        message: c.message.clone(),
                        last_transition_time: c.last_transition_time.as_ref().map(|t| t.0),
                    })
                    .collect()
            })
            .unwrap_or_default();

        let accepted = status
            .and_then(|s| s.accepted_names.as_ref())
            .map(|a| CrdAcceptedNames {
                kind: a.kind.clone(),
                plural: a.plural.clone(),
                singular: a.singular.clone(),
                short_names: a.short_names.clone().unwrap_or_default(),
                categories: a.categories.clone().unwrap_or_default(),
                list_kind: a.list_kind.clone(),
            })
            .unwrap_or_else(|| CrdAcceptedNames {
                kind: names.kind.clone(),
                plural: names.plural.clone(),
                singular: names.singular.clone(),
                short_names: names.short_names.clone().unwrap_or_default(),
                categories: names.categories.clone().unwrap_or_default(),
                list_kind: names.list_kind.clone(),
            });

        CrdDetailInfo {
            name: crd.name_any(),
            group: spec.group.clone(),
            kind: names.kind.clone(),
            plural: names.plural.clone(),
            singular: names.singular.clone().unwrap_or_default(),
            scope: spec.scope.clone(),
            versions,
            short_names: names.short_names.clone().unwrap_or_default(),
            categories: names.categories.clone().unwrap_or_default(),
            labels: crd.labels().clone(),
            annotations: crd
                .annotations()
                .iter()
                .filter(|(k, _)| !k.starts_with("kubectl.kubernetes.io"))
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
            conditions,
            created_at: crd.creation_timestamp().map(|t| t.0),
            accepted_names: accepted,
        }
    }
}

fn dynamic_object_to_custom_resource_info(obj: &DynamicObject) -> CustomResourceInfo {
    let owner_refs: Vec<OwnerReferenceInfo> = obj
        .metadata
        .owner_references
        .as_ref()
        .map(|refs| {
            refs.iter()
                .map(|r| OwnerReferenceInfo {
                    api_version: r.api_version.clone(),
                    kind: r.kind.clone(),
                    name: r.name.clone(),
                    uid: r.uid.clone(),
                    controller: r.controller,
                })
                .collect()
        })
        .unwrap_or_default();

    let spec = obj.data.get("spec").cloned().unwrap_or(serde_json::Value::Null);
    let status = obj.data.get("status").cloned();

    CustomResourceInfo {
        name: obj.name_any(),
        namespace: obj.namespace(),
        uid: obj.metadata.uid.clone().unwrap_or_default(),
        api_version: obj
            .types
            .as_ref()
            .map(|t| t.api_version.clone())
            .unwrap_or_default(),
        kind: obj
            .types
            .as_ref()
            .map(|t| t.kind.clone())
            .unwrap_or_default(),
        spec,
        status,
        labels: obj.labels().clone(),
        annotations: obj
            .annotations()
            .iter()
            .filter(|(k, _)| !k.starts_with("kubectl.kubernetes.io"))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
        created_at: obj.creation_timestamp().map(|t| t.0),
        owner_references: owner_refs,
    }
}

fn dynamic_object_to_detail_info(obj: &DynamicObject) -> CustomResourceDetailInfo {
    let owner_refs: Vec<OwnerReferenceInfo> = obj
        .metadata
        .owner_references
        .as_ref()
        .map(|refs| {
            refs.iter()
                .map(|r| OwnerReferenceInfo {
                    api_version: r.api_version.clone(),
                    kind: r.kind.clone(),
                    name: r.name.clone(),
                    uid: r.uid.clone(),
                    controller: r.controller,
                })
                .collect()
        })
        .unwrap_or_default();

    let spec = obj.data.get("spec").cloned().unwrap_or(serde_json::Value::Null);
    let status = obj.data.get("status").cloned();

    CustomResourceDetailInfo {
        name: obj.name_any(),
        namespace: obj.namespace(),
        uid: obj.metadata.uid.clone().unwrap_or_default(),
        api_version: obj
            .types
            .as_ref()
            .map(|t| t.api_version.clone())
            .unwrap_or_default(),
        kind: obj
            .types
            .as_ref()
            .map(|t| t.kind.clone())
            .unwrap_or_default(),
        spec,
        status,
        labels: obj.labels().clone(),
        annotations: obj
            .annotations()
            .iter()
            .filter(|(k, _)| !k.starts_with("kubectl.kubernetes.io"))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
        created_at: obj.creation_timestamp().map(|t| t.0),
        owner_references: owner_refs,
        finalizers: obj.metadata.finalizers.clone().unwrap_or_default(),
        resource_version: obj.metadata.resource_version.clone(),
    }
}

// =============================================================================
// CRD Commands
// =============================================================================

/// List all CRDs, optionally grouped by API group
#[tauri::command]
pub async fn list_crds(
    grouped: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Vec<CrdGroup>> {
    let list = crate::commands::helpers::list_cluster_resources::<CustomResourceDefinition>(
        state,
        None,
        None,
        None,
    )
    .await?;

    let crds: Vec<CrdInfo> = list.items.iter().map(CrdInfo::from).collect();

    if grouped.unwrap_or(true) {
        // Group by API group
        let mut groups: BTreeMap<String, Vec<CrdInfo>> = BTreeMap::new();
        for crd in crds {
            groups.entry(crd.group.clone()).or_default().push(crd);
        }

        // Sort CRDs within each group by name
        Ok(groups
            .into_iter()
            .map(|(group, mut crds)| {
                crds.sort_by(|a, b| a.name.cmp(&b.name));
                CrdGroup { group, crds }
            })
            .collect())
    } else {
        // Return as single "ungrouped" group
        Ok(vec![CrdGroup {
            group: String::new(),
            crds,
        }])
    }
}

/// Get CRD details by name
#[tauri::command]
pub async fn get_crd(name: String, state: State<'_, AppState>) -> Result<CrdDetailInfo> {
    crate::validation::validate_dns_subdomain(&name)?;
    let crd: CustomResourceDefinition =
        crate::commands::helpers::get_cluster_resource(name, state).await?;
    Ok(CrdDetailInfo::from(&crd))
}

/// Get CRD YAML
#[tauri::command]
pub async fn get_crd_yaml(name: String, state: State<'_, AppState>) -> Result<String> {
    crate::validation::validate_dns_subdomain(&name)?;
    let ctx = ResourceContext::for_list(&state, None)?;
    let api: Api<CustomResourceDefinition> = ctx.cluster_api();
    let crd = api.get(&name).await?;

    let yaml =
        serde_yaml::to_string(&crd).map_err(|e| Error::Serialization(e.to_string()))?;
    crate::commands::helpers::clean_yaml_for_editor(&yaml)
}

/// Delete a CRD
#[tauri::command]
pub async fn delete_crd(name: String, state: State<'_, AppState>) -> Result<()> {
    crate::validation::validate_dns_subdomain(&name)?;
    crate::commands::helpers::delete_cluster_resource::<CustomResourceDefinition>(name, state, None)
        .await
}

/// Get OpenAPI schema for a CRD version
#[tauri::command]
pub async fn get_crd_schema(
    name: String,
    version: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value> {
    crate::validation::validate_dns_subdomain(&name)?;
    let crd: CustomResourceDefinition =
        crate::commands::helpers::get_cluster_resource(name.clone(), state).await?;

    let target_version = version.unwrap_or_else(|| {
        // Find storage version
        crd.spec
            .versions
            .iter()
            .find(|v| v.storage)
            .map(|v| v.name.clone())
            .unwrap_or_else(|| {
                crd.spec
                    .versions
                    .first()
                    .map(|v| v.name.clone())
                    .unwrap_or_default()
            })
    });

    let version_spec = crd
        .spec
        .versions
        .iter()
        .find(|v| v.name == target_version)
        .ok_or_else(|| Error::NotFound {
            kind: "CRDVersion".to_string(),
            name: target_version.clone(),
            namespace: name.clone(),
        })?;

    version_spec
        .schema
        .as_ref()
        .and_then(|s| s.open_api_v3_schema.as_ref())
        .and_then(|s| serde_json::to_value(s).ok())
        .ok_or_else(|| Error::NotFound {
            kind: "Schema".to_string(),
            name: target_version,
            namespace: name,
        })
}

// =============================================================================
// Custom Resource Commands
// =============================================================================

/// List custom resource instances for a specific CRD
#[tauri::command]
pub async fn list_custom_resources(
    crd_name: String,
    namespace: Option<String>,
    label_selector: Option<String>,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<CustomResourceInfo>> {
    crate::validation::validate_dns_subdomain(&crd_name)?;
    // First get the CRD to understand its structure
    let crd: CustomResourceDefinition =
        crate::commands::helpers::get_cluster_resource(crd_name.clone(), state.clone()).await?;

    let spec = &crd.spec;

    // Find storage version
    let version = spec
        .versions
        .iter()
        .find(|v| v.storage)
        .map(|v| v.name.clone())
        .unwrap_or_else(|| {
            spec.versions
                .first()
                .map(|v| v.name.clone())
                .unwrap_or_default()
        });

    // Build ApiResource for dynamic API
    let api_resource = ApiResource {
        group: spec.group.clone(),
        version,
        kind: spec.names.kind.clone(),
        api_version: if spec.group.is_empty() {
            spec.versions
                .first()
                .map(|v| v.name.clone())
                .unwrap_or_default()
        } else {
            format!(
                "{}/{}",
                spec.group,
                spec.versions
                    .first()
                    .map(|v| v.name.clone())
                    .unwrap_or_default()
            )
        },
        plural: spec.names.plural.clone(),
    };

    let is_namespaced = spec.scope == "Namespaced";
    let ctx = ResourceContext::for_list(&state, namespace)?;

    let api = ctx.dynamic_api_for_resource(&api_resource, !is_namespaced);
    let params = build_list_params(label_selector.as_deref(), None, limit);

    let list = api.list(&params).await?;

    Ok(list
        .items
        .iter()
        .map(dynamic_object_to_custom_resource_info)
        .collect())
}

/// Get a single custom resource instance
#[tauri::command]
pub async fn get_custom_resource(
    crd_name: String,
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<CustomResourceDetailInfo> {
    crate::validation::validate_dns_subdomain(&crd_name)?;
    crate::validation::validate_dns_subdomain(&name)?;

    let crd: CustomResourceDefinition =
        crate::commands::helpers::get_cluster_resource(crd_name.clone(), state.clone()).await?;

    let spec = &crd.spec;
    let version = spec
        .versions
        .iter()
        .find(|v| v.storage)
        .map(|v| v.name.clone())
        .unwrap_or_else(|| {
            spec.versions
                .first()
                .map(|v| v.name.clone())
                .unwrap_or_default()
        });

    let api_resource = ApiResource {
        group: spec.group.clone(),
        version: version.clone(),
        kind: spec.names.kind.clone(),
        api_version: if spec.group.is_empty() {
            version
        } else {
            format!("{}/{}", spec.group, version)
        },
        plural: spec.names.plural.clone(),
    };

    let is_namespaced = spec.scope == "Namespaced";

    let ctx = if is_namespaced {
        ResourceContext::for_command(&state, namespace)?
    } else {
        ResourceContext::for_list(&state, None)?
    };

    let api = ctx.dynamic_api_for_resource(&api_resource, !is_namespaced);
    let obj = api.get(&name).await?;

    Ok(dynamic_object_to_detail_info(&obj))
}

/// Get custom resource YAML
#[tauri::command]
pub async fn get_custom_resource_yaml(
    crd_name: String,
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    crate::validation::validate_dns_subdomain(&crd_name)?;
    crate::validation::validate_dns_subdomain(&name)?;

    let crd: CustomResourceDefinition =
        crate::commands::helpers::get_cluster_resource(crd_name.clone(), state.clone()).await?;

    let spec = &crd.spec;
    let version = spec
        .versions
        .iter()
        .find(|v| v.storage)
        .map(|v| v.name.clone())
        .unwrap_or_else(|| {
            spec.versions
                .first()
                .map(|v| v.name.clone())
                .unwrap_or_default()
        });

    let api_resource = ApiResource {
        group: spec.group.clone(),
        version: version.clone(),
        kind: spec.names.kind.clone(),
        api_version: if spec.group.is_empty() {
            version
        } else {
            format!("{}/{}", spec.group, version)
        },
        plural: spec.names.plural.clone(),
    };

    let is_namespaced = spec.scope == "Namespaced";

    let ctx = if is_namespaced {
        ResourceContext::for_command(&state, namespace)?
    } else {
        ResourceContext::for_list(&state, None)?
    };

    let api = ctx.dynamic_api_for_resource(&api_resource, !is_namespaced);
    let obj = api.get(&name).await?;

    let yaml = serde_yaml::to_string(&obj).map_err(|e| Error::Serialization(e.to_string()))?;
    crate::commands::helpers::clean_yaml_for_editor(&yaml)
}

/// Delete a custom resource instance
#[tauri::command]
pub async fn delete_custom_resource(
    crd_name: String,
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::validation::validate_dns_subdomain(&crd_name)?;
    crate::validation::validate_dns_subdomain(&name)?;

    let crd: CustomResourceDefinition =
        crate::commands::helpers::get_cluster_resource(crd_name.clone(), state.clone()).await?;

    let spec = &crd.spec;
    let version = spec
        .versions
        .iter()
        .find(|v| v.storage)
        .map(|v| v.name.clone())
        .unwrap_or_else(|| {
            spec.versions
                .first()
                .map(|v| v.name.clone())
                .unwrap_or_default()
        });

    let api_resource = ApiResource {
        group: spec.group.clone(),
        version: version.clone(),
        kind: spec.names.kind.clone(),
        api_version: if spec.group.is_empty() {
            version
        } else {
            format!("{}/{}", spec.group, version)
        },
        plural: spec.names.plural.clone(),
    };

    let is_namespaced = spec.scope == "Namespaced";

    let ctx = if is_namespaced {
        ResourceContext::for_command(&state, namespace)?
    } else {
        ResourceContext::for_list(&state, None)?
    };

    let api = ctx.dynamic_api_for_resource(&api_resource, !is_namespaced);
    api.delete(&name, &DeleteParams::default()).await?;

    Ok(())
}
