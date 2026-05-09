//! YAML round-trip helpers — fetch a resource and clean its YAML
//! for the editor by stripping server-managed metadata.

use crate::error::{Error, Result};
use crate::state::AppState;
use tauri::State;

use super::context::ResourceContext;

/// Get resource YAML (namespaced)
pub async fn get_resource_yaml<K>(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String>
where
    K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope>
        + serde::Serialize
        + serde::de::DeserializeOwned
        + Clone
        + std::fmt::Debug,
    K::DynamicType: Default,
{
    let ctx = ResourceContext::for_command(&state, namespace)?;
    let resource = ctx.namespaced_api::<K>().get(&name).await?;
    let yaml = serde_yaml::to_string(&resource).map_err(|e| Error::Serialization(e.to_string()))?;
    clean_yaml_for_editor(&yaml)
}

/// Clean YAML for editor (remove unwanted fields, format)
pub fn clean_yaml_for_editor(yaml: &str) -> Result<String> {
    let mut value: serde_yaml::Value = serde_yaml::from_str(yaml)
        .map_err(|e| Error::Serialization(format!("Failed to parse YAML: {e}")))?;

    if let Some(mapping) = value.as_mapping_mut() {
        // Remove status (server-managed)
        mapping.remove("status");

        // Remove server-managed metadata fields
        if let Some(metadata) = mapping.get_mut("metadata") {
            if let Some(meta_map) = metadata.as_mapping_mut() {
                for field in [
                    "resourceVersion",
                    "uid",
                    "generation",
                    "creationTimestamp",
                    "selfLink",
                    "managedFields",
                    "ownerReferences",
                    "finalizers",
                    "deletionTimestamp",
                    "deletionGracePeriodSeconds",
                ] {
                    meta_map.remove(field);
                }
            }
        }
    }

    serde_yaml::to_string(&value)
        .map_err(|e| Error::Serialization(format!("Failed to serialize YAML: {e}")))
}
