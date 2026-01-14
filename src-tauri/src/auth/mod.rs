//! Authentication module
//!
//! Provides support for multiple Kubernetes authentication methods including:
//! - Kubeconfig-based authentication
//! - Bearer token authentication
//! - OIDC authentication
//! - AWS EKS authentication
//! - GCP GKE authentication
//! - Azure AKS authentication

mod aws_eks;
mod azure_aks;
mod bearer;
mod gcp_gke;
mod interactive;
mod kubeconfig;
pub mod license_client;
mod oidc;

pub use aws_eks::AwsEksAuth;
pub use azure_aks::{is_aks_exec_command, parse_aks_exec_args, AksClusterInfo, AzureAksAuth};
pub use bearer::BearerTokenAuth;
pub use gcp_gke::{is_gke_exec_command, parse_gke_exec_args, GcpGkeAuth, GkeClusterInfo};
pub use interactive::prepare_kubeconfig_for_context;
pub use kubeconfig::KubeconfigAuth;
pub use oidc::OidcAuth;

use serde::{Deserialize, Serialize};

#[must_use]
pub fn auth_disabled() -> bool {
    matches!(
        option_env!("VITE_DISABLE_AUTH"),
        Some("1") | Some("true")
    )
}

/// Authentication result with token and expiry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResult {
    /// Access token or credential
    pub token: String,

    /// Token expiry timestamp (if known)
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,

    /// Refresh token (for OIDC)
    pub refresh_token: Option<String>,

    /// Token type (Bearer, etc.)
    pub token_type: String,
}

impl AuthResult {
    /// Check if the token is expired
    #[must_use]
    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            expires_at < chrono::Utc::now()
        } else {
            false
        }
    }

    /// Check if the token will expire soon (within 5 minutes)
    #[must_use]
    pub fn expires_soon(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            expires_at < chrono::Utc::now() + chrono::Duration::minutes(5)
        } else {
            false
        }
    }
}

/// Trait for authentication providers
#[async_trait::async_trait]
pub trait AuthProvider: Send + Sync {
    /// Get authentication token/credentials
    async fn authenticate(&self) -> crate::error::Result<AuthResult>;

    /// Refresh authentication if supported
    async fn refresh(&self, auth: &AuthResult) -> crate::error::Result<AuthResult>;

    /// Check if refresh is supported
    fn supports_refresh(&self) -> bool;

    /// Get provider name
    fn name(&self) -> &'static str;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auth_result_expiry() {
        let result = AuthResult {
            token: "test".to_string(),
            expires_at: Some(chrono::Utc::now() - chrono::Duration::hours(1)),
            refresh_token: None,
            token_type: "Bearer".to_string(),
        };

        assert!(result.is_expired());
    }

    #[test]
    fn test_auth_result_not_expired() {
        let result = AuthResult {
            token: "test".to_string(),
            expires_at: Some(chrono::Utc::now() + chrono::Duration::hours(1)),
            refresh_token: None,
            token_type: "Bearer".to_string(),
        };

        assert!(!result.is_expired());
    }
}
