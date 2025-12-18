//! Kubernetes context management

use serde::{Deserialize, Serialize};

/// Information about a Kubernetes context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextInfo {
    /// Context name
    pub name: String,
    /// Cluster name
    pub cluster: String,
    /// User name
    pub user: String,
    /// Default namespace
    pub namespace: Option<String>,
    /// Whether this is the current context
    pub is_current: bool,
}

/// Represents a Kubernetes cluster context with connection details
#[derive(Debug, Clone)]
pub struct ClusterContext {
    /// Context name
    pub name: String,
    /// Cluster endpoint URL
    pub server: String,
    /// Cluster CA certificate (base64 encoded)
    pub certificate_authority_data: Option<String>,
    /// Whether to skip TLS verification
    pub insecure_skip_tls_verify: bool,
    /// Default namespace for this context
    pub default_namespace: String,
}

impl ClusterContext {
    /// Create a new cluster context
    pub fn new(name: impl Into<String>, server: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            server: server.into(),
            certificate_authority_data: None,
            insecure_skip_tls_verify: false,
            default_namespace: "default".to_string(),
        }
    }

    /// Set the CA certificate data
    pub fn with_ca_data(mut self, ca_data: impl Into<String>) -> Self {
        self.certificate_authority_data = Some(ca_data.into());
        self
    }

    /// Set insecure TLS verification
    pub fn with_insecure_tls(mut self, insecure: bool) -> Self {
        self.insecure_skip_tls_verify = insecure;
        self
    }

    /// Set the default namespace
    pub fn with_namespace(mut self, namespace: impl Into<String>) -> Self {
        self.default_namespace = namespace.into();
        self
    }
}

impl Default for ClusterContext {
    fn default() -> Self {
        Self {
            name: "default".to_string(),
            server: "https://localhost:6443".to_string(),
            certificate_authority_data: None,
            insecure_skip_tls_verify: false,
            default_namespace: "default".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_info() {
        let info = ContextInfo {
            name: "test".to_string(),
            cluster: "test-cluster".to_string(),
            user: "test-user".to_string(),
            namespace: Some("default".to_string()),
            is_current: true,
        };
        
        assert_eq!(info.name, "test");
        assert!(info.is_current);
    }

    #[test]
    fn test_cluster_context_builder() {
        let ctx = ClusterContext::new("prod", "https://k8s.example.com:6443")
            .with_namespace("production")
            .with_insecure_tls(false);
        
        assert_eq!(ctx.name, "prod");
        assert_eq!(ctx.default_namespace, "production");
        assert!(!ctx.insecure_skip_tls_verify);
    }
}
