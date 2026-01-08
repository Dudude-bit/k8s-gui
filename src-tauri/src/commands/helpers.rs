//! Helper functions for Tauri commands

use crate::error::{Error, Result};
use crate::state::AppState;
use crate::utils::normalize_optional_namespace;
use kube::api::DynamicObject;
use kube::api::DeleteParams;
use kube::api::ListParams;
use kube::discovery::{ApiCapabilities, ApiResource, Scope};
use kube::Resource;
use kube::{Api, Client};
use tauri::State;

/// Build `ListParams` from optional selectors and limit
#[must_use]
pub fn build_list_params(
    label_selector: Option<&str>,
    field_selector: Option<&str>,
    limit: Option<i64>,
) -> ListParams {
    let mut params = ListParams::default();
    if let Some(labels) = label_selector {
        params = params.labels(labels);
    }
    if let Some(fields) = field_selector {
        params = params.fields(fields);
    }
    if let Some(limit) = limit {
        if limit > 0 {
            params = params.limit(limit as u32);
        }
    }
    params
}

/// Context for Kubernetes API access with optional namespace scope.
pub struct ResourceContext {
    pub client: Client,
    pub namespace: Option<String>,
}

impl ResourceContext {
    /// Create context from state. If `require_namespace` is true, defaults to "default".
    fn from_state(
        state: &State<'_, AppState>,
        namespace: Option<String>,
        require_namespace: bool,
    ) -> Result<Self> {
        let context = state
            .get_current_context()
            .ok_or_else(|| Error::Internal("No cluster connected".to_string()))?;

        let client = state
            .client_manager
            .get_client(&context)
            .ok_or_else(|| Error::Internal("Client not found".to_string()))
            .map(|c| (*c).clone())?;

        let namespace = if require_namespace {
            Some(normalize_optional_namespace(namespace).unwrap_or_else(|| "default".to_string()))
        } else {
            normalize_optional_namespace(namespace)
        };

        Ok(ResourceContext { client, namespace })
    }

    /// Create context from AppState directly (useful outside Tauri commands).
    fn from_app_state(
        state: &AppState,
        namespace: Option<String>,
        require_namespace: bool,
    ) -> Result<Self> {
        let context = state
            .get_current_context()
            .ok_or_else(|| Error::Internal("No cluster connected".to_string()))?;

        let client = state
            .client_manager
            .get_client(&context)
            .ok_or_else(|| Error::Internal("Client not found".to_string()))
            .map(|c| (*c).clone())?;

        let namespace = if require_namespace {
            Some(normalize_optional_namespace(namespace).unwrap_or_else(|| "default".to_string()))
        } else {
            normalize_optional_namespace(namespace)
        };

        Ok(ResourceContext { client, namespace })
    }

    /// Create context directly from a client (for use outside of Tauri commands)
    #[must_use]
    pub fn from_client(client: Client, namespace: String) -> Self {
        ResourceContext {
            client,
            namespace: Some(namespace),
        }
    }

    /// For single-resource commands (get/delete) - requires namespace, defaults to "default"
    pub fn for_command(state: &State<'_, AppState>, namespace: Option<String>) -> Result<Self> {
        Self::from_state(state, namespace, true)
    }

    /// For list commands - namespace is optional (None = all namespaces)
    pub fn for_list(state: &State<'_, AppState>, namespace: Option<String>) -> Result<Self> {
        Self::from_state(state, namespace, false)
    }

    /// For list commands without Tauri state - namespace is optional (None = all namespaces)
    pub fn for_list_from_app_state(
        state: &AppState,
        namespace: Option<String>,
    ) -> Result<Self> {
        Self::from_app_state(state, namespace, false)
    }

    #[must_use]
    pub fn namespaced_api<K>(&self) -> Api<K>
    where
        K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope>,
        K::DynamicType: Default,
    {
        let namespace = self
            .namespace
            .as_deref()
            .expect("namespaced_api() requires namespace to be Some");
        Api::namespaced(self.client.clone(), namespace)
    }

    #[must_use]
    pub fn namespaced_or_cluster_api<K>(&self) -> Api<K>
    where
        K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope>,
        K::DynamicType: Default,
    {
        if self.namespace.is_some() {
            self.namespaced_api()
        } else {
            self.cluster_api()
        }
    }

    #[must_use]
    pub fn dynamic_api(
        &self,
        api_resource: &ApiResource,
        caps: &ApiCapabilities,
    ) -> Api<DynamicObject> {
        match caps.scope {
            Scope::Namespaced => match self.namespace.as_deref() {
                Some(ns) => Api::namespaced_with(self.client.clone(), ns, api_resource),
                None => Api::all_with(self.client.clone(), api_resource),
            },
            Scope::Cluster => Api::all_with(self.client.clone(), api_resource),
        }
    }

    /// Create dynamic API for a resource (without ApiCapabilities)
    #[must_use]
    pub fn dynamic_api_for_resource(
        &self,
        api_resource: &ApiResource,
        is_cluster_scoped: bool,
    ) -> Api<DynamicObject> {
        if is_cluster_scoped {
            Api::all_with(self.client.clone(), api_resource)
        } else {
            match self.namespace.as_deref() {
                Some(ns) => Api::namespaced_with(self.client.clone(), ns, api_resource),
                None => Api::all_with(self.client.clone(), api_resource),
            }
        }
    }

    #[must_use]
    pub fn cluster_api<K: Resource>(&self) -> Api<K>
    where
        K::DynamicType: Default,
    {
        Api::all(self.client.clone())
    }
}



// =============================================================================
// Namespaced Resource Helpers
// =============================================================================

/// Get a single namespaced resource
pub async fn get_resource<K>(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<K>
where
    K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope>
        + Clone
        + std::fmt::Debug
        + serde::de::DeserializeOwned,
    K::DynamicType: Default,
{
    let ctx = ResourceContext::for_command(&state, namespace)?;
    ctx.namespaced_api::<K>().get(&name).await.map_err(Error::from)
}

/// Delete a namespaced resource
pub async fn delete_resource<K>(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
    delete_params: Option<DeleteParams>,
) -> Result<()>
where
    K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope>
        + Clone
        + std::fmt::Debug
        + serde::de::DeserializeOwned,
    K::DynamicType: Default,
{
    let ctx = ResourceContext::for_command(&state, namespace)?;
    let params = delete_params.unwrap_or_default();
    ctx.namespaced_api::<K>().delete(&name, &params).await?;
    Ok(())
}

/// List namespaced resources with common filters
pub async fn list_resources<K>(
    namespace: Option<String>,
    state: State<'_, AppState>,
    label_selector: Option<&str>,
    field_selector: Option<&str>,
    limit: Option<i64>,
) -> Result<kube::core::ObjectList<K>>
where
    K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope>
        + Clone
        + std::fmt::Debug
        + serde::de::DeserializeOwned,
    K::DynamicType: Default,
{
    let ctx = ResourceContext::for_list(&state, namespace)?;
    let params = build_list_params(label_selector, field_selector, limit);
    ctx.namespaced_or_cluster_api::<K>().list(&params).await.map_err(Error::from)
}

// =============================================================================
// Cluster-scoped Resource Helpers
// =============================================================================

/// Get a single cluster-scoped resource
pub async fn get_cluster_resource<K>(
    name: String,
    state: State<'_, AppState>,
) -> Result<K>
where
    K: kube::Resource<Scope = k8s_openapi::ClusterResourceScope>
        + Clone
        + std::fmt::Debug
        + serde::de::DeserializeOwned,
    K::DynamicType: Default,
{
    let ctx = ResourceContext::for_list(&state, None)?;
    ctx.cluster_api::<K>().get(&name).await.map_err(Error::from)
}

/// Delete a cluster-scoped resource
pub async fn delete_cluster_resource<K>(
    name: String,
    state: State<'_, AppState>,
    delete_params: Option<DeleteParams>,
) -> Result<()>
where
    K: kube::Resource<Scope = k8s_openapi::ClusterResourceScope>
        + Clone
        + std::fmt::Debug
        + serde::de::DeserializeOwned,
    K::DynamicType: Default,
{
    let ctx = ResourceContext::for_list(&state, None)?;
    let params = delete_params.unwrap_or_default();
    ctx.cluster_api::<K>().delete(&name, &params).await?;
    Ok(())
}

/// List cluster-scoped resources with common filters
pub async fn list_cluster_resources<K>(
    state: State<'_, AppState>,
    label_selector: Option<&str>,
    field_selector: Option<&str>,
    limit: Option<i64>,
) -> Result<kube::core::ObjectList<K>>
where
    K: kube::Resource<Scope = k8s_openapi::ClusterResourceScope>
        + Clone
        + std::fmt::Debug
        + serde::de::DeserializeOwned,
    K::DynamicType: Default,
{
    let ctx = ResourceContext::for_list(&state, None)?;
    let params = build_list_params(label_selector, field_selector, limit);
    ctx.cluster_api::<K>().list(&params).await.map_err(Error::from)
}

// =============================================================================
// YAML Helpers
// =============================================================================

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
