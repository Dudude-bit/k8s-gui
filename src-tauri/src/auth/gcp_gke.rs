//! GCP GKE native authentication provider
//!
//! Provides native authentication for Google Kubernetes Engine clusters
//! using the `gcp_auth` crate instead of relying on the `gcloud` CLI.

use super::{AuthProvider, AuthResult};
use crate::error::{AuthError, Error, Result};
use async_trait::async_trait;
use std::path::PathBuf;
use std::sync::Arc;

/// GCP GKE authentication provider
///
/// Uses `gcp_auth` to obtain access tokens through:
/// - Application Default Credentials (ADC)
/// - Service account JSON key file
/// - GCE metadata server (when running on GCP)
/// - User credentials from `gcloud auth application-default login`
pub struct GcpGkeAuth {
    /// Optional path to service account JSON key file
    service_account_key_path: Option<PathBuf>,
    /// Scopes for the token (defaults to cloud-platform)
    scopes: Vec<String>,
}

impl GcpGkeAuth {
    /// Create a new GCP GKE auth provider
    ///
    /// # Arguments
    ///
    /// * `service_account_key_path` - Optional path to a service account JSON key file.
    ///   If not provided, uses Application Default Credentials.
    #[must_use]
    pub fn new(service_account_key_path: Option<PathBuf>) -> Self {
        Self {
            service_account_key_path,
            scopes: vec!["https://www.googleapis.com/auth/cloud-platform".to_string()],
        }
    }

    /// Create a new GCP GKE auth provider with custom scopes
    #[must_use]
    pub fn with_scopes(service_account_key_path: Option<PathBuf>, scopes: Vec<String>) -> Self {
        Self {
            service_account_key_path,
            scopes,
        }
    }

    /// Get an access token using gcp_auth
    async fn get_token(&self) -> Result<(String, Option<chrono::DateTime<chrono::Utc>>)> {
        let provider = self.create_auth_provider().await?;

        let scopes: Vec<&str> = self.scopes.iter().map(String::as_str).collect();
        let token = provider.token(&scopes).await.map_err(|e| {
            Error::Auth(AuthError::GcpAuth(format!(
                "Failed to obtain GCP access token: {e}"
            )))
        })?;

        // gcp_auth Token doesn't expose expiry directly, but tokens are typically valid for 1 hour
        let expires_at = chrono::Utc::now() + chrono::Duration::minutes(55);

        Ok((token.as_str().to_string(), Some(expires_at)))
    }

    /// Create the appropriate authentication provider based on configuration
    async fn create_auth_provider(&self) -> Result<Arc<dyn gcp_auth::TokenProvider>> {
        if let Some(key_path) = &self.service_account_key_path {
            // Use service account key file
            if !key_path.exists() {
                return Err(Error::Auth(AuthError::GcpAuth(format!(
                    "Service account key file not found: {}",
                    key_path.display()
                ))));
            }

            let key_json = std::fs::read_to_string(key_path).map_err(|e| {
                Error::Auth(AuthError::GcpAuth(format!(
                    "Failed to read service account key file: {e}"
                )))
            })?;

            let service_account =
                gcp_auth::CustomServiceAccount::from_json(&key_json).map_err(|e| {
                    Error::Auth(AuthError::GcpAuth(format!(
                        "Invalid service account key file: {e}"
                    )))
                })?;

            Ok(Arc::new(service_account) as Arc<dyn gcp_auth::TokenProvider>)
        } else {
            // Use Application Default Credentials
            let provider = gcp_auth::provider().await.map_err(|e| {
                Error::Auth(AuthError::GcpAuth(format!(
                    "Failed to initialize GCP Application Default Credentials: {e}. \
                     Try running 'gcloud auth application-default login' or set \
                     GOOGLE_APPLICATION_CREDENTIALS environment variable."
                )))
            })?;
            Ok(provider)
        }
    }
}

#[async_trait]
impl AuthProvider for GcpGkeAuth {
    async fn authenticate(&self) -> Result<AuthResult> {
        let (token, expires_at) = self.get_token().await?;

        Ok(AuthResult {
            token,
            expires_at,
            refresh_token: None,
            token_type: "Bearer".to_string(),
        })
    }

    async fn refresh(&self, _auth: &AuthResult) -> Result<AuthResult> {
        // GCP tokens can be refreshed by obtaining a new one
        // The gcp_auth library handles caching and refresh internally
        self.authenticate().await
    }

    fn supports_refresh(&self) -> bool {
        true
    }

    fn name(&self) -> &'static str {
        "gcp_gke"
    }
}

/// Detect if an exec command is for GKE authentication
///
/// Returns true if the command appears to be a GKE auth plugin
pub fn is_gke_exec_command(command: &str) -> bool {
    let cmd_lower = command.to_lowercase();
    cmd_lower.contains("gke-gcloud-auth-plugin")
        || cmd_lower.contains("gcloud")
        || (cmd_lower.contains("google") && cmd_lower.contains("auth"))
}

/// Extract GKE cluster info from exec args if present
pub fn parse_gke_exec_args(_args: &[String]) -> Option<GkeClusterInfo> {
    // gke-gcloud-auth-plugin doesn't take cluster name directly
    // The cluster context is usually in the kubeconfig context name format:
    // gke_PROJECT_ZONE_CLUSTER or gke_PROJECT_REGION_CLUSTER
    None // GKE auth plugin doesn't need cluster info for token generation
}

/// GKE cluster information parsed from context or exec args
#[derive(Debug, Clone)]
pub struct GkeClusterInfo {
    pub project_id: String,
    pub location: String,
    pub cluster_name: String,
}

impl GkeClusterInfo {
    /// Parse GKE cluster info from a kubeconfig context name
    ///
    /// GKE contexts typically follow the format: gke_PROJECT_LOCATION_CLUSTER
    pub fn from_context_name(context: &str) -> Option<Self> {
        if !context.starts_with("gke_") {
            return None;
        }

        let parts: Vec<&str> = context.splitn(4, '_').collect();
        if parts.len() != 4 {
            return None;
        }

        Some(Self {
            project_id: parts[1].to_string(),
            location: parts[2].to_string(),
            cluster_name: parts[3].to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gcp_gke_auth_creation() {
        let auth = GcpGkeAuth::new(None);
        assert_eq!(auth.name(), "gcp_gke");
        assert!(auth.supports_refresh());
    }

    #[test]
    fn test_gcp_gke_auth_with_service_account() {
        let auth = GcpGkeAuth::new(Some(PathBuf::from("/path/to/key.json")));
        assert_eq!(auth.name(), "gcp_gke");
    }

    #[test]
    fn test_is_gke_exec_command() {
        assert!(is_gke_exec_command("gke-gcloud-auth-plugin"));
        assert!(is_gke_exec_command("/usr/bin/gke-gcloud-auth-plugin"));
        assert!(is_gke_exec_command("gcloud"));
        assert!(!is_gke_exec_command("aws-iam-authenticator"));
        assert!(!is_gke_exec_command("kubelogin"));
    }

    #[test]
    fn test_gke_cluster_info_from_context() {
        let info = GkeClusterInfo::from_context_name("gke_my-project_us-central1-a_my-cluster");
        assert!(info.is_some());
        let info = info.unwrap();
        assert_eq!(info.project_id, "my-project");
        assert_eq!(info.location, "us-central1-a");
        assert_eq!(info.cluster_name, "my-cluster");

        // Invalid format
        assert!(GkeClusterInfo::from_context_name("not-gke-context").is_none());
        assert!(GkeClusterInfo::from_context_name("gke_only_two").is_none());
    }
}
