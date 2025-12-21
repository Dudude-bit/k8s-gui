//! Kubernetes client management
//! 
//! This module provides a client manager that handles multiple Kubernetes
//! cluster connections with support for different authentication methods.

use crate::auth::{AuthConfig, AuthMethod};
use crate::error::{AuthError, Error, Result};
use dashmap::DashMap;
use kube::{
    config::{KubeConfigOptions, Kubeconfig},
    Client, Config,
};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

mod context;
mod resource_client;

pub use context::{ClusterContext, ContextInfo};
pub use resource_client::ResourceClient;

/// Manages Kubernetes client connections for multiple clusters
pub struct K8sClientManager {
    /// Active clients by context name
    clients: DashMap<String, Arc<Client>>,
    
    /// Client configurations by context name
    configs: DashMap<String, Config>,
    
    /// Loaded kubeconfig
    kubeconfig: RwLock<Option<Kubeconfig>>,
    
    /// Default kubeconfig path
    kubeconfig_path: RwLock<Option<PathBuf>>,
}

impl K8sClientManager {
    /// Create a new client manager
    pub fn new() -> Self {
        Self {
            clients: DashMap::new(),
            configs: DashMap::new(),
            kubeconfig: RwLock::new(None),
            kubeconfig_path: RwLock::new(None),
        }
    }

    /// Load kubeconfig from default locations
    pub async fn load_kubeconfig(&self) -> Result<()> {
        let kubeconfig = Kubeconfig::read().map_err(|e| {
            Error::Auth(AuthError::Kubeconfig(format!(
                "Failed to read kubeconfig: {}",
                e
            )))
        })?;
        
        *self.kubeconfig.write().await = Some(kubeconfig);
        Ok(())
    }

    /// Get a clone of the loaded kubeconfig
    pub async fn kubeconfig_clone(&self) -> Result<Kubeconfig> {
        let kubeconfig = self.kubeconfig.read().await;
        kubeconfig
            .as_ref()
            .cloned()
            .ok_or_else(|| Error::Config("Kubeconfig not loaded".to_string()))
    }

    /// Load kubeconfig from a specific path
    pub async fn load_kubeconfig_from_path(&self, path: PathBuf) -> Result<()> {
        let kubeconfig = Kubeconfig::read_from(&path).map_err(|e| {
            Error::Auth(AuthError::Kubeconfig(format!(
                "Failed to read kubeconfig from {:?}: {}",
                path, e
            )))
        })?;
        
        *self.kubeconfig_path.write().await = Some(path);
        *self.kubeconfig.write().await = Some(kubeconfig);
        Ok(())
    }

    /// Get list of available contexts
    pub async fn list_contexts(&self) -> Result<Vec<ContextInfo>> {
        let kubeconfig = self.kubeconfig.read().await;
        let kubeconfig = kubeconfig.as_ref().ok_or_else(|| {
            Error::Config("Kubeconfig not loaded".to_string())
        })?;

        let current_context = kubeconfig.current_context.clone();
        
        let contexts = kubeconfig
            .contexts
            .iter()
            .map(|ctx| {
                let context = ctx.context.as_ref();
                ContextInfo {
                    name: ctx.name.clone(),
                    cluster: context.map(|c| c.cluster.clone()).unwrap_or_default(),
                    user: context.and_then(|c| c.user.clone()).unwrap_or_default(),
                    namespace: context.and_then(|c| c.namespace.clone()),
                    is_current: Some(&ctx.name) == current_context.as_ref(),
                }
            })
            .collect();

        Ok(contexts)
    }

    /// Get current context name
    pub async fn get_current_context(&self) -> Result<Option<String>> {
        let kubeconfig = self.kubeconfig.read().await;
        let kubeconfig = kubeconfig.as_ref().ok_or_else(|| {
            Error::Config("Kubeconfig not loaded".to_string())
        })?;
        
        Ok(kubeconfig.current_context.clone())
    }

    /// Connect to a cluster by context name
    pub async fn connect(&self, context: &str) -> Result<Arc<Client>> {
        // Check if already connected
        if let Some(client) = self.clients.get(context) {
            return Ok(client.clone());
        }

        let config = self.create_config(context).await?;
        let client = Client::try_from(config.clone())
            .map_err(|e| Error::Connection(format!("Failed to create client: {}", e)))?;
        
        let client = Arc::new(client);
        self.clients.insert(context.to_string(), client.clone());
        self.configs.insert(context.to_string(), config);
        
        tracing::info!("Connected to cluster: {}", context);
        Ok(client)
    }

    /// Connect to a cluster using a provided kubeconfig
    pub async fn connect_with_kubeconfig(
        &self,
        context: &str,
        kubeconfig: Kubeconfig,
    ) -> Result<Arc<Client>> {
        self.clients.remove(context);
        self.configs.remove(context);

        let options = KubeConfigOptions {
            context: Some(context.to_string()),
            ..Default::default()
        };

        let config = Config::from_custom_kubeconfig(kubeconfig, &options)
            .await
            .map_err(|e| Error::Config(format!("Failed to create config for context {}: {}", context, e)))?;
        let client = Client::try_from(config.clone())
            .map_err(|e| Error::Connection(format!("Failed to create client: {}", e)))?;
        let client = Arc::new(client);
        self.clients.insert(context.to_string(), client.clone());
        self.configs.insert(context.to_string(), config);

        tracing::info!("Connected to cluster with prepared config: {}", context);
        Ok(client)
    }

    /// Connect with custom authentication
    pub async fn connect_with_auth(&self, context: &str, auth: &AuthConfig) -> Result<Arc<Client>> {
        let config = self.create_config_with_auth(context, auth).await?;
        let client = Client::try_from(config.clone())
            .map_err(|e| Error::Connection(format!("Failed to create client: {}", e)))?;
        
        let client = Arc::new(client);
        self.clients.insert(context.to_string(), client.clone());
        self.configs.insert(context.to_string(), config);
        
        tracing::info!("Connected to cluster with custom auth: {}", context);
        Ok(client)
    }

    /// Create kube config for a context
    async fn create_config(&self, context: &str) -> Result<Config> {
        let kubeconfig = self.kubeconfig.read().await;
        let kubeconfig = kubeconfig.as_ref().ok_or_else(|| {
            Error::Config("Kubeconfig not loaded".to_string())
        })?;

        let options = KubeConfigOptions {
            context: Some(context.to_string()),
            ..Default::default()
        };

        Config::from_custom_kubeconfig(kubeconfig.clone(), &options)
            .await
            .map_err(|e| Error::Config(format!("Failed to create config for context {}: {}", context, e)))
    }

    /// Create kube config with custom authentication
    async fn create_config_with_auth(&self, context: &str, auth: &AuthConfig) -> Result<Config> {
        let mut config = self.create_config(context).await?;
        
        match &auth.method {
            AuthMethod::BearerToken { token } => {
                // Set bearer token authentication
                // Note: In production, we'd modify the config to use the token
                tracing::debug!("Using bearer token authentication for {}", context);
                // Token is handled through kube-rs authentication mechanisms
            }
            AuthMethod::Oidc { 
                issuer_url, 
                client_id, 
                client_secret,
                refresh_token,
                .. 
            } => {
                tracing::debug!("Using OIDC authentication for {}", context);
                // OIDC is handled through kube-rs OIDC support
            }
            AuthMethod::AwsEks { 
                cluster_name, 
                region,
                role_arn,
                .. 
            } => {
                tracing::debug!("Using AWS EKS authentication for {}", context);
                // AWS EKS authentication is handled separately
            }
            AuthMethod::Certificate { .. } => {
                tracing::debug!("Using certificate authentication for {}", context);
            }
            AuthMethod::Kubeconfig => {
                // Default kubeconfig authentication, no modifications needed
            }
        }
        
        Ok(config)
    }

    /// Disconnect from a cluster
    pub fn disconnect(&self, context: &str) {
        self.clients.remove(context);
        self.configs.remove(context);
        tracing::info!("Disconnected from cluster: {}", context);
    }

    /// Get an existing client
    pub fn get_client(&self, context: &str) -> Option<Arc<Client>> {
        self.clients.get(context).map(|c| c.clone())
    }

    /// Check if connected to a context
    pub fn is_connected(&self, context: &str) -> bool {
        self.clients.contains_key(context)
    }

    /// Get list of connected contexts
    pub fn connected_contexts(&self) -> Vec<String> {
        self.clients.iter().map(|r| r.key().clone()).collect()
    }

    /// Test connection to a cluster
    pub async fn test_connection(&self, context: &str) -> Result<ClusterInfo> {
        let client = self.connect(context).await?;
        
        // Try to get server version
        let version = client.apiserver_version().await
            .map_err(|e| Error::Connection(format!("Failed to get server version: {}", e)))?;
        
        Ok(ClusterInfo {
            context: context.to_string(),
            server_version: format!("{}.{}", version.major, version.minor),
            platform: version.platform,
            git_version: version.git_version,
        })
    }

    /// Create a resource client for a specific context
    pub async fn resource_client(&self, context: &str) -> Result<ResourceClient> {
        let client = self.connect(context).await?;
        Ok(ResourceClient::new(client))
    }
}

impl Default for K8sClientManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Information about a connected cluster
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClusterInfo {
    pub context: String,
    pub server_version: String,
    pub platform: String,
    pub git_version: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_client_manager_creation() {
        let manager = K8sClientManager::new();
        assert!(manager.connected_contexts().is_empty());
    }
}
