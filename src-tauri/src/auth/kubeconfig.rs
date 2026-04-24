//! Kubeconfig-based authentication

use super::{AuthProvider, AuthResult};
use crate::error::{AuthError, Error, Result};
use async_trait::async_trait;

/// Kubeconfig file authentication provider
pub struct KubeconfigAuth {
    /// Path to kubeconfig file (None = default)
    path: Option<std::path::PathBuf>,
}

impl KubeconfigAuth {
    /// Create a new kubeconfig auth provider using default path
    #[must_use]
    pub fn new() -> Self {
        Self { path: None }
    }

    /// Create with a specific kubeconfig path
    #[must_use]
    pub fn with_path(path: std::path::PathBuf) -> Self {
        Self { path: Some(path) }
    }
}

#[async_trait]
impl AuthProvider for KubeconfigAuth {
    async fn authenticate(&self) -> Result<AuthResult> {
        // kubeconfig authentication is handled by kube-rs directly
        // This provider simply validates the kubeconfig is accessible

        let kubeconfig = if let Some(path) = &self.path {
            kube::config::Kubeconfig::read_from(path)
        } else {
            kube::config::Kubeconfig::read()
        };

        kubeconfig.map_err(|e| {
            Error::Auth(AuthError::Kubeconfig(format!(
                "Failed to read kubeconfig: {e}"
            )))
        })?;

        // Return a placeholder token - actual auth is handled by kube-rs
        Ok(AuthResult {
            token: "kubeconfig".to_string(),
            expires_at: None,
            refresh_token: None,
            token_type: "Kubeconfig".to_string(),
        })
    }

    async fn refresh(&self, _auth: &AuthResult) -> Result<AuthResult> {
        // Kubeconfig doesn't need refresh, re-authenticate
        self.authenticate().await
    }

    fn supports_refresh(&self) -> bool {
        false
    }

    fn name(&self) -> &'static str {
        "kubeconfig"
    }
}

impl Default for KubeconfigAuth {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_kubeconfig_auth_creation() {
        let auth = KubeconfigAuth::new();
        assert_eq!(auth.name(), "kubeconfig");
        assert!(!auth.supports_refresh());
    }
}
