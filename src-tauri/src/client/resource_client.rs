//! Generic Kubernetes resource client
//!
//! Provides CRUD operations and watch functionality for any Kubernetes resource.

use crate::error::{Error, Result};
use futures::{Stream, TryStreamExt};
use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::{ConfigMap, Event, Namespace, Node, Pod, Secret, Service};
use kube::{
    api::{Api, DeleteParams, ListParams, Patch, PatchParams, PostParams, WatchEvent},
    Client, Resource,
};
use serde::{de::DeserializeOwned, Serialize};
use std::fmt::Debug;
use std::pin::Pin;
use std::sync::Arc;

/// A client for working with Kubernetes resources
#[derive(Clone)]
pub struct ResourceClient {
    client: Arc<Client>,
}

impl ResourceClient {
    /// Create a new resource client
    #[must_use]
    pub fn new(client: Arc<Client>) -> Self {
        Self { client }
    }

    /// Get the underlying kube client
    #[must_use]
    pub fn inner(&self) -> &Client {
        &self.client
    }

    /// Create an API handle for a namespaced resource
    #[must_use]
    pub fn namespaced<K>(&self, namespace: &str) -> Api<K>
    where
        K: Resource<Scope = k8s_openapi::NamespaceResourceScope>,
        <K as Resource>::DynamicType: Default,
    {
        Api::namespaced((*self.client).clone(), namespace)
    }

    /// Create an API handle for a cluster-scoped resource
    #[must_use]
    pub fn cluster<K>(&self) -> Api<K>
    where
        K: Resource<Scope = k8s_openapi::ClusterResourceScope>,
        <K as Resource>::DynamicType: Default,
    {
        Api::all((*self.client).clone())
    }

    /// Create an API handle for all namespaces
    #[must_use]
    pub fn all_namespaces<K>(&self) -> Api<K>
    where
        K: Resource,
        <K as Resource>::DynamicType: Default,
    {
        Api::all((*self.client).clone())
    }

    /// List resources with optional filtering
    pub async fn list<K>(&self, api: &Api<K>, params: Option<ListParams>) -> Result<Vec<K>>
    where
        K: Clone + DeserializeOwned + Debug,
    {
        let params = params.unwrap_or_default();
        let list = api.list(&params).await?;
        Ok(list.items)
    }

    /// Get a single resource by name
    pub async fn get<K>(&self, api: &Api<K>, name: &str) -> Result<K>
    where
        K: Clone + DeserializeOwned + Debug + Resource,
        <K as Resource>::DynamicType: Default,
    {
        api.get(name).await.map_err(|e| {
            if is_not_found(&e) {
                Error::NotFound {
                    kind: K::kind(&Default::default()).to_string(),
                    name: name.to_string(),
                    namespace: "unknown".to_string(),
                }
            } else {
                e.into()
            }
        })
    }

    /// Create a new resource
    pub async fn create<K>(&self, api: &Api<K>, resource: &K) -> Result<K>
    where
        K: Clone + DeserializeOwned + Debug + Serialize + Resource,
    {
        let params = PostParams::default();
        api.create(&params, resource).await.map_err(Into::into)
    }

    /// Update an existing resource
    pub async fn update<K>(&self, api: &Api<K>, name: &str, resource: &K) -> Result<K>
    where
        K: Clone + DeserializeOwned + Debug + Serialize + Resource,
    {
        let params = PostParams::default();
        api.replace(name, &params, resource)
            .await
            .map_err(Into::into)
    }

    /// Patch a resource
    pub async fn patch<K, P>(&self, api: &Api<K>, name: &str, patch: &Patch<P>) -> Result<K>
    where
        K: Clone + DeserializeOwned + Debug + Resource,
        P: Serialize + Debug,
    {
        let params = PatchParams::default();
        api.patch(name, &params, patch).await.map_err(Into::into)
    }

    /// Delete a resource
    pub async fn delete<K>(&self, api: &Api<K>, name: &str) -> Result<()>
    where
        K: Clone + DeserializeOwned + Debug + Resource,
    {
        let params = DeleteParams::default();
        api.delete(name, &params).await?;
        Ok(())
    }

    /// Watch for resource changes
    pub async fn watch<K>(
        &self,
        api: &Api<K>,
        params: Option<kube::api::WatchParams>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<WatchEvent<K>>> + Send>>>
    where
        K: Clone + DeserializeOwned + Debug + Send + 'static,
    {
        let params = params.unwrap_or_default();
        let stream = api.watch(&params, "0").await?.map_err(Error::KubeApi);

        Ok(Box::pin(stream))
    }

    // Convenience methods for common resources

    /// List pods in a namespace
    pub async fn list_pods(&self, namespace: &str, params: Option<ListParams>) -> Result<Vec<Pod>> {
        let api: Api<Pod> = self.namespaced(namespace);
        self.list(&api, params).await
    }

    /// Get a pod
    pub async fn get_pod(&self, namespace: &str, name: &str) -> Result<Pod> {
        let api: Api<Pod> = self.namespaced(namespace);
        self.get(&api, name).await
    }

    /// Delete a pod
    pub async fn delete_pod(&self, namespace: &str, name: &str) -> Result<()> {
        let api: Api<Pod> = self.namespaced(namespace);
        self.delete(&api, name).await
    }

    /// List deployments in a namespace
    pub async fn list_deployments(
        &self,
        namespace: &str,
        params: Option<ListParams>,
    ) -> Result<Vec<Deployment>> {
        let api: Api<Deployment> = self.namespaced(namespace);
        self.list(&api, params).await
    }

    /// Get a deployment
    pub async fn get_deployment(&self, namespace: &str, name: &str) -> Result<Deployment> {
        let api: Api<Deployment> = self.namespaced(namespace);
        self.get(&api, name).await
    }

    /// Scale a deployment
    pub async fn scale_deployment(
        &self,
        namespace: &str,
        name: &str,
        replicas: i32,
    ) -> Result<Deployment> {
        let api: Api<Deployment> = self.namespaced(namespace);
        let patch = serde_json::json!({
            "spec": {
                "replicas": replicas
            }
        });
        self.patch(&api, name, &Patch::Merge(&patch)).await
    }

    /// List services in a namespace
    pub async fn list_services(
        &self,
        namespace: &str,
        params: Option<ListParams>,
    ) -> Result<Vec<Service>> {
        let api: Api<Service> = self.namespaced(namespace);
        self.list(&api, params).await
    }

    /// List namespaces
    pub async fn list_namespaces(&self, params: Option<ListParams>) -> Result<Vec<Namespace>> {
        let api: Api<Namespace> = self.cluster();
        self.list(&api, params).await
    }

    /// List nodes
    pub async fn list_nodes(&self, params: Option<ListParams>) -> Result<Vec<Node>> {
        let api: Api<Node> = self.cluster();
        self.list(&api, params).await
    }

    /// Get a node
    pub async fn get_node(&self, name: &str) -> Result<Node> {
        let api: Api<Node> = self.cluster();
        self.get(&api, name).await
    }

    /// List configmaps in a namespace
    pub async fn list_configmaps(
        &self,
        namespace: &str,
        params: Option<ListParams>,
    ) -> Result<Vec<ConfigMap>> {
        let api: Api<ConfigMap> = self.namespaced(namespace);
        self.list(&api, params).await
    }

    /// List secrets in a namespace
    pub async fn list_secrets(
        &self,
        namespace: &str,
        params: Option<ListParams>,
    ) -> Result<Vec<Secret>> {
        let api: Api<Secret> = self.namespaced(namespace);
        self.list(&api, params).await
    }

    /// List events in a namespace
    pub async fn list_events(
        &self,
        namespace: &str,
        params: Option<ListParams>,
    ) -> Result<Vec<Event>> {
        let api: Api<Event> = self.namespaced(namespace);
        self.list(&api, params).await
    }
}

/// Check if a kube error is a `NotFound` error
fn is_not_found(err: &kube::Error) -> bool {
    matches!(err, kube::Error::Api(resp) if resp.code == 404)
}

#[cfg(test)]
mod tests {

    #[test]
    fn test_resource_meta_creation() {
        // Test would require a mock resource
    }
}
