//! Helper functions for Tauri commands
//! 
//! Provides common functionality for resource commands to reduce duplication

use crate::error::{Error, Result};
use crate::state::AppState;
use crate::utils::{normalize_namespace, require_namespace};
use kube::api::ListParams;
use kube::Client;
use std::sync::Arc;
use tauri::State;
use serde::Serialize;

/// Command execution context with pre-resolved client, context name, and namespace.
/// 
/// This struct eliminates boilerplate code in Tauri commands by providing
/// a single point for client and namespace resolution.
/// 
/// # Example
/// 
/// ```rust,ignore
/// #[tauri::command]
/// pub async fn get_pod(
///     name: String,
///     namespace: Option<String>,
///     state: State<'_, AppState>,
/// ) -> Result<PodInfo> {
///     let ctx = CommandContext::new(&state, namespace)?;
///     let api: kube::Api<Pod> = ctx.namespaced_api();
///     let pod = api.get(&name).await?;
///     Ok(PodInfo::from(&pod))
/// }
/// ```
#[derive(Clone)]
pub struct CommandContext {
    /// The Kubernetes client
    pub client: Arc<Client>,
    /// The current context name
    pub context_name: String,
    /// The resolved namespace (either from parameter or from state)
    pub namespace: String,
}

impl CommandContext {
    /// Create a new CommandContext with a required namespace.
    /// 
    /// Returns an error if no namespace is provided and none is set in state.
    #[must_use = "CommandContext should be used to access cluster resources"]
    pub fn new(state: &AppState, namespace: Option<String>) -> Result<Self> {
        let context_name = state
            .get_current_context()
            .ok_or_else(|| Error::Connection("No cluster connected".to_string()))?;

        let client = state
            .client_manager
            .get_client(&context_name)
            .ok_or_else(|| Error::Connection(format!("Client not found for context: {}", context_name)))?;

        let namespace = require_namespace(namespace, state.get_namespace(&context_name))?;

        Ok(Self {
            client,
            context_name,
            namespace,
        })
    }

    /// Create a new CommandContext with optional namespace (can be None for cluster-wide operations).
    /// 
    /// If namespace is None and state has a default, uses the default.
    /// If namespace is Some(""), treats as all namespaces (None).
    pub fn new_optional_namespace(state: &AppState, namespace: Option<String>) -> Result<Self> {
        let context_name = state
            .get_current_context()
            .ok_or_else(|| Error::Connection("No cluster connected".to_string()))?;

        let client = state
            .client_manager
            .get_client(&context_name)
            .ok_or_else(|| Error::Connection(format!("Client not found for context: {}", context_name)))?;

        let resolved_namespace = normalize_namespace(namespace, state.get_namespace(&context_name))
            .unwrap_or_else(|| "default".to_string());

        Ok(Self {
            client,
            context_name,
            namespace: resolved_namespace,
        })
    }

    /// Create a namespaced API for the given resource type.
    #[inline]
    pub fn namespaced_api<K>(&self) -> kube::Api<K>
    where
        K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope>,
        <K as kube::Resource>::DynamicType: Default,
    {
        kube::Api::namespaced((*self.client).clone(), &self.namespace)
    }

    /// Create a cluster-wide API for the given resource type.
    #[inline]
    pub fn all_api<K>(&self) -> kube::Api<K>
    where
        K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope>,
        <K as kube::Resource>::DynamicType: Default,
    {
        kube::Api::all((*self.client).clone())
    }

    /// Create a cluster-scoped API (for resources like Nodes, Namespaces).
    #[inline]
    pub fn cluster_api<K>(&self) -> kube::Api<K>
    where
        K: kube::Resource<Scope = k8s_openapi::ClusterResourceScope>,
        <K as kube::Resource>::DynamicType: Default,
    {
        kube::Api::all((*self.client).clone())
    }

    /// Get the raw client for custom operations.
    #[inline]
    pub fn client(&self) -> &Client {
        &self.client
    }
}

/// List context for operations where namespace can be None (all namespaces).
/// 
/// This is useful for list operations where you want to list resources
/// across all namespaces or in a specific namespace.
/// 
/// # Example
/// 
/// ```rust,ignore
/// #[tauri::command]
/// pub async fn list_pods(
///     namespace: Option<String>,
///     state: State<'_, AppState>,
/// ) -> Result<Vec<PodInfo>> {
///     let ctx = ListContext::new(&state, namespace)?;
///     let api: kube::Api<Pod> = ctx.api();
///     let list = api.list(&ListParams::default()).await?;
///     Ok(list.items.iter().map(PodInfo::from).collect())
/// }
/// ```
#[derive(Clone)]
pub struct ListContext {
    /// The Kubernetes client
    pub client: Arc<Client>,
    /// The current context name
    pub context_name: String,
    /// The optional namespace (None means all namespaces)
    pub namespace: Option<String>,
}

impl ListContext {
    /// Create a new ListContext with optional namespace.
    /// 
    /// If namespace is None and state has a default, uses the default.
    /// If namespace is Some("") or explicitly None, returns None (all namespaces).
    pub fn new(state: &AppState, namespace: Option<String>) -> Result<Self> {
        let context_name = state
            .get_current_context()
            .ok_or_else(|| Error::Connection("No cluster connected".to_string()))?;

        let client = state
            .client_manager
            .get_client(&context_name)
            .ok_or_else(|| Error::Connection(format!("Client not found for context: {}", context_name)))?;

        let resolved_namespace = normalize_namespace(namespace, state.get_namespace(&context_name));

        Ok(Self {
            client,
            context_name,
            namespace: resolved_namespace,
        })
    }

    /// Create an API for the resource type.
    /// Returns namespaced API if namespace is set, otherwise returns all-namespaces API.
    #[inline]
    pub fn api<K>(&self) -> kube::Api<K>
    where
        K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope>,
        <K as kube::Resource>::DynamicType: Default,
    {
        match &self.namespace {
            Some(ns) => kube::Api::namespaced((*self.client).clone(), ns),
            None => kube::Api::all((*self.client).clone()),
        }
    }

    /// Create a cluster-scoped API (for resources like Nodes, Namespaces).
    #[inline]
    pub fn cluster_api<K>(&self) -> kube::Api<K>
    where
        K: kube::Resource<Scope = k8s_openapi::ClusterResourceScope>,
        <K as kube::Resource>::DynamicType: Default,
    {
        kube::Api::all((*self.client).clone())
    }

    /// Get the raw client for custom operations.
    #[inline]
    pub fn client(&self) -> &Client {
        &self.client
    }
}

/// Get the current Kubernetes client from app state
pub fn get_k8s_client(state: &AppState) -> Result<Arc<kube::Client>> {
    let context = state
        .get_current_context()
        .ok_or_else(|| Error::Connection("No cluster connected".to_string()))?;

    state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| Error::Connection(format!("Client not found for context: {}", context)))
}

// Note: Generic API helper functions removed due to type constraints.
// Use concrete types directly: `kube::Api::<ResourceType>::namespaced(...)` or `kube::Api::<ResourceType>::all(...)`

/// Build ListParams from common filter options
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
    
    if let Some(limit_val) = limit {
        if limit_val > 0 {
            params = params.limit(limit_val as u32);
        }
    }
    
    params
}

use serde::de::DeserializeOwned;

/// Clean YAML for editor - remove server-managed fields that users shouldn't see or edit
/// This makes the YAML cleaner and avoids confusion about non-editable fields
pub fn clean_yaml_for_editor(yaml: &str) -> Result<String> {
    let mut doc: serde_yaml::Value = serde_yaml::from_str(yaml)
        .map_err(|e| Error::Serialization(format!("Failed to parse YAML: {}", e)))?;

    if let serde_yaml::Value::Mapping(ref mut map) = doc {
        // Remove status (server-managed, not editable)
        map.remove(&serde_yaml::Value::String("status".to_string()));

        // Clean metadata
        if let Some(serde_yaml::Value::Mapping(ref mut metadata)) =
            map.get_mut(&serde_yaml::Value::String("metadata".to_string()))
        {
            // Remove server-managed fields
            let fields_to_remove = [
                "managedFields",
                "resourceVersion",
                "uid",
                "creationTimestamp",
                "generation",
                "selfLink",
            ];
            for field in fields_to_remove {
                metadata.remove(&serde_yaml::Value::String(field.to_string()));
            }

            // Clean legacy kubectl annotation
            if let Some(serde_yaml::Value::Mapping(ref mut annotations)) =
                metadata.get_mut(&serde_yaml::Value::String("annotations".to_string()))
            {
                annotations.remove(&serde_yaml::Value::String(
                    "kubectl.kubernetes.io/last-applied-configuration".to_string(),
                ));
                if annotations.is_empty() {
                    metadata.remove(&serde_yaml::Value::String("annotations".to_string()));
                }
            }
        }
    }

    serde_yaml::to_string(&doc).map_err(|e| Error::Serialization(e.to_string()))
}

/// Generic function to get resource YAML for namespace-scoped resources
pub async fn get_resource_yaml<K>(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String>
where
    K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope> + Serialize + Clone + std::fmt::Debug + DeserializeOwned,
    <K as kube::Resource>::DynamicType: Default,
{
    let ctx = CommandContext::new(&state, namespace)?;
    let api: kube::Api<K> = ctx.namespaced_api();
    let resource = api.get(&name).await?;
    let yaml = serde_yaml::to_string(&resource)
        .map_err(|e| Error::Serialization(e.to_string()))?;
    clean_yaml_for_editor(&yaml)
}

/// Generic function to get resource YAML for cluster-scoped resources
pub async fn get_cluster_resource_yaml<K>(
    name: String,
    state: State<'_, AppState>,
) -> Result<String>
where
    K: kube::Resource<Scope = k8s_openapi::ClusterResourceScope> + Serialize + Clone + std::fmt::Debug + DeserializeOwned,
    <K as kube::Resource>::DynamicType: Default,
{
    let ctx = ListContext::new(&state, None)?;
    let api: kube::Api<K> = ctx.cluster_api();
    let resource = api.get(&name).await?;
    let yaml = serde_yaml::to_string(&resource)
        .map_err(|e| Error::Serialization(e.to_string()))?;
    clean_yaml_for_editor(&yaml)
}

/// Generic function to delete a namespace-scoped resource
pub async fn delete_resource<K>(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
    delete_params: Option<kube::api::DeleteParams>,
) -> Result<()>
where
    K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope> + Clone + std::fmt::Debug + DeserializeOwned,
    <K as kube::Resource>::DynamicType: Default,
{
    let ctx = CommandContext::new(&state, namespace)?;
    let api: kube::Api<K> = ctx.namespaced_api();
    let params = delete_params.unwrap_or_else(|| kube::api::DeleteParams::default());
    api.delete(&name, &params).await?;
    Ok(())
}

/// Generic function to get a namespace-scoped resource and convert it to an Info type
pub async fn get_resource<K, I>(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<I>
where
    K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope> + Clone + std::fmt::Debug + DeserializeOwned,
    <K as kube::Resource>::DynamicType: Default,
    I: for<'a> From<&'a K>,
{
    let ctx = CommandContext::new(&state, namespace)?;
    let api: kube::Api<K> = ctx.namespaced_api();
    let resource = api.get(&name).await?;
    Ok(I::from(&resource))
}

/// Trait for list filters
pub trait ListFilters {
    fn namespace(&self) -> Option<String>;
    fn label_selector(&self) -> Option<String>;
    fn field_selector(&self) -> Option<String>;
    fn limit(&self) -> Option<i64>;
}

/// Generic function to list namespace-scoped resources
pub async fn list_resources<K, I>(
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<I>>
where
    K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope> + Clone + std::fmt::Debug + DeserializeOwned,
    <K as kube::Resource>::DynamicType: Default,
    I: for<'a> From<&'a K>,
{
    let ctx = ListContext::new(&state, namespace)?;
    let params = ListParams::default();
    let api: kube::Api<K> = ctx.api();
    let list = api.list(&params).await?;
    Ok(list.items.iter().map(I::from).collect())
}

/// Generic function to list namespace-scoped resources with filters
pub async fn list_resources_with_params<K, I>(
    namespace: Option<String>,
    label_selector: Option<&str>,
    field_selector: Option<&str>,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<I>>
where
    K: kube::Resource<Scope = k8s_openapi::NamespaceResourceScope> + Clone + std::fmt::Debug + DeserializeOwned,
    <K as kube::Resource>::DynamicType: Default,
    I: for<'a> From<&'a K>,
{
    let ctx = ListContext::new(&state, namespace)?;
    let params = build_list_params(label_selector, field_selector, limit);
    let api: kube::Api<K> = ctx.api();
    let list = api.list(&params).await?;
    Ok(list.items.iter().map(I::from).collect())
}

