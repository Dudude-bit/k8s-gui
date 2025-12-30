//! Helper functions for Tauri commands

use crate::error::{Error, Result};
use crate::state::AppState;
use kube::api::DeleteParams;
use kube::api::ListParams;
use kube::Resource;
use kube::{Api, Client};
use tauri::State;

/// Get Kubernetes client from app state
pub fn get_k8s_client(state: &State<'_, AppState>) -> Result<Client> {
    let context = state
        .get_current_context()
        .ok_or_else(|| Error::Internal("No cluster connected".to_string()))?;

    state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| Error::Internal("Client not found".to_string()))
        .map(|c| (*c).clone())
}

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

/// Context for namespaced resource commands
pub struct CommandContext {
    pub client: Client,
    pub namespace: String,
}

impl CommandContext {
    pub fn new(state: &State<'_, AppState>, namespace: Option<String>) -> Result<Self> {
        let context = state
            .get_current_context()
            .ok_or_else(|| Error::Internal("No cluster connected".to_string()))?;

        let client = state
            .client_manager
            .get_client(&context)
            .ok_or_else(|| Error::Internal("Client not found".to_string()))
            .map(|c| (*c).clone())?;

        let namespace = namespace
            .or_else(|| Some(state.get_namespace(&context)))
            .unwrap_or_else(|| "default".to_string());

        Ok(CommandContext { client, namespace })
    }

    #[must_use]
    pub fn namespaced_api<K>(&self) -> Api<K>
    where
        K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope>,
        K::DynamicType: Default,
    {
        Api::namespaced(self.client.clone(), &self.namespace)
    }
}

/// Context for cluster-scoped or namespaced list commands
pub struct ListContext {
    pub client: Client,
    pub namespace: Option<String>,
}

impl ListContext {
    pub fn new(state: &State<'_, AppState>, namespace: Option<String>) -> Result<Self> {
        let context = state
            .get_current_context()
            .ok_or_else(|| Error::Internal("No cluster connected".to_string()))?;

        let client = state
            .client_manager
            .get_client(&context)
            .ok_or_else(|| Error::Internal("Client not found".to_string()))
            .map(|c| (*c).clone())?;

        let namespace = namespace.or_else(|| Some(state.get_namespace(&context)));

        Ok(ListContext { client, namespace })
    }

    /// Get API for a resource.
    /// When namespace is Some, this uses `Api::all()` which doesn't filter by namespace.
    /// For proper namespace filtering with namespaced resources, use `namespaced_api()` instead.
    #[must_use]
    pub fn api<K>(&self) -> Api<K>
    where
        K: kube::Resource,
        K::DynamicType: Default,
    {
        // BUG FIX: This should use Api::namespaced() when namespace is Some, but we can't
        // conditionally call Api::namespaced() without a trait bound. Callers with a namespace
        // should use namespaced_api() instead for proper filtering.
        Api::all(self.client.clone())
    }

    /// Get namespaced API for a resource when namespace filtering is needed.
    /// Use this when you have a namespace and K is a namespaced resource.
    /// This properly filters resources to the specified namespace.
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
    pub fn cluster_api<K: Resource>(&self) -> Api<K>
    where
        K::DynamicType: Default,
    {
        Api::all(self.client.clone())
    }
}

/// Get resource YAML
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
    let ctx = CommandContext::new(&state, namespace)?;
    let api: Api<K> = ctx.namespaced_api();
    let resource = api.get(&name).await?;

    let yaml = serde_yaml::to_string(&resource).map_err(|e| Error::Serialization(e.to_string()))?;
    clean_yaml_for_editor(&yaml)
}

/// Delete a resource
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
    let ctx = CommandContext::new(&state, namespace)?;
    let api: Api<K> = ctx.namespaced_api();
    let params = delete_params.unwrap_or_default();
    api.delete(&name, &params).await?;
    Ok(())
}

/// Clean YAML for editor (remove unwanted fields, format)
pub fn clean_yaml_for_editor(yaml: &str) -> Result<String> {
    // Parse YAML into a Value structure
    let mut value: serde_yaml::Value = serde_yaml::from_str(yaml)
        .map_err(|e| Error::Serialization(format!("Failed to parse YAML: {e}")))?;

    // Remove top-level status field (server-managed)
    if let Some(mapping) = value.as_mapping_mut() {
        mapping.remove("status");

        // Remove server-managed fields from metadata
        if let Some(metadata) = mapping.get_mut("metadata") {
            if let Some(meta_map) = metadata.as_mapping_mut() {
                // Remove server-managed metadata fields
                meta_map.remove("resourceVersion");
                meta_map.remove("uid");
                meta_map.remove("generation");
                meta_map.remove("creationTimestamp");
                meta_map.remove("selfLink");
                meta_map.remove("managedFields");
                // Note: We keep name, namespace, labels, annotations as they may be edited
            }
        }
    }

    // Serialize back to YAML
    let cleaned = serde_yaml::to_string(&value)
        .map_err(|e| Error::Serialization(format!("Failed to serialize YAML: {e}")))?;

    Ok(cleaned)
}

/// Get a single resource
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
    let ctx = CommandContext::new(&state, namespace)?;
    let api: Api<K> = ctx.namespaced_api();
    api.get(&name).await.map_err(Error::from)
}

/// List resources with common filters
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
    let ctx = ListContext::new(&state, namespace)?;
    let params = build_list_params(label_selector, field_selector, limit);

    let api: Api<K> = if ctx.namespace.is_some() {
        ctx.namespaced_api()
    } else {
        // Use cluster-wide list if no namespace specified (for resources that support it)
        // Note: For namespaced resources, this lists across ALL namespaces
        ctx.cluster_api()
    };

    api.list(&params).await.map_err(Error::from)
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
    let ctx = ListContext::new(&state, None)?;
    let params = build_list_params(label_selector, field_selector, limit);

    let api: Api<K> = ctx.cluster_api();
    api.list(&params).await.map_err(Error::from)
}
