//! Authentication module
//! 
//! Provides support for multiple Kubernetes authentication methods including:
//! - Kubeconfig-based authentication
//! - Bearer token authentication
//! - OIDC authentication
//! - AWS EKS authentication

mod aws_eks;
mod bearer;
mod kubeconfig;
mod oidc;
mod interactive;
mod manager;
mod credentials;
pub mod license_client;
pub mod auth_client_hooks;

pub use aws_eks::AwsEksAuth;
pub use bearer::BearerTokenAuth;
pub use kubeconfig::KubeconfigAuth;
pub use oidc::OidcAuth;
pub use interactive::prepare_kubeconfig_for_context;
pub use manager::AuthManager;
pub use credentials::CredentialStore;

use serde::{Deserialize, Serialize};

/// Authentication method enumeration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AuthMethod {
    /// Use kubeconfig file authentication
    Kubeconfig,
    
    /// Bearer token authentication
    BearerToken {
        token: String,
    },
    
    /// Client certificate authentication
    Certificate {
        client_certificate_data: String,
        client_key_data: String,
    },
    
    /// OIDC authentication
    Oidc {
        issuer_url: String,
        client_id: String,
        client_secret: Option<String>,
        refresh_token: Option<String>,
        id_token: Option<String>,
        scopes: Vec<String>,
    },
    
    /// AWS EKS authentication
    AwsEks {
        cluster_name: String,
        region: String,
        role_arn: Option<String>,
        profile: Option<String>,
    },
}

/// Authentication configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    /// Authentication method
    pub method: AuthMethod,
    
    /// Optional: Override server URL
    pub server_url: Option<String>,
    
    /// Optional: CA certificate data (base64 encoded)
    pub ca_data: Option<String>,
    
    /// Skip TLS verification
    #[serde(default)]
    pub insecure_skip_tls_verify: bool,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            method: AuthMethod::Kubeconfig,
            server_url: None,
            ca_data: None,
            insecure_skip_tls_verify: false,
        }
    }
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
    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            expires_at < chrono::Utc::now()
        } else {
            false
        }
    }

    /// Check if the token will expire soon (within 5 minutes)
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

/// Authentication status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthStatus {
    /// Not authenticated
    NotAuthenticated,
    /// Authentication in progress
    Authenticating,
    /// Successfully authenticated
    Authenticated {
        method: String,
        expires_at: Option<chrono::DateTime<chrono::Utc>>,
    },
    /// Authentication failed
    Failed {
        error: String,
    },
    /// Token expired
    Expired,
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

    #[test]
    fn test_auth_config_default() {
        let config = AuthConfig::default();
        assert!(matches!(config.method, AuthMethod::Kubeconfig));
    }
}
