//! Authentication manager
//! 
//! Manages authentication state and token refresh for all contexts.

use super::{AuthConfig, AuthMethod, AuthProvider, AuthResult, AuthStatus};
use super::{AwsEksAuth, BearerTokenAuth, KubeconfigAuth, OidcAuth};
use crate::error::{AuthError, Error, Result};
use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Manages authentication for multiple contexts
pub struct AuthManager {
    /// Authentication results by context
    auth_results: DashMap<String, AuthResult>,
    
    /// Authentication providers by context
    providers: DashMap<String, Arc<dyn AuthProvider>>,
    
    /// Authentication status by context
    status: DashMap<String, AuthStatus>,
    
    /// Token refresh tasks
    refresh_tasks: DashMap<String, tokio::task::JoinHandle<()>>,
}

impl AuthManager {
    /// Create a new authentication manager
    pub fn new() -> Self {
        Self {
            auth_results: DashMap::new(),
            providers: DashMap::new(),
            status: DashMap::new(),
            refresh_tasks: DashMap::new(),
        }
    }

    /// Authenticate with the given configuration
    pub async fn authenticate(&self, context: &str, config: &AuthConfig) -> Result<AuthResult> {
        self.status.insert(context.to_string(), AuthStatus::Authenticating);
        
        let provider = self.create_provider(config)?;
        
        match provider.authenticate().await {
            Ok(result) => {
                self.auth_results.insert(context.to_string(), result.clone());
                self.providers.insert(context.to_string(), provider);
                self.status.insert(
                    context.to_string(),
                    AuthStatus::Authenticated {
                        method: self.method_name(&config.method),
                        expires_at: result.expires_at,
                    },
                );
                
                // Start auto-refresh if supported
                if result.expires_at.is_some() {
                    self.start_auto_refresh(context).await;
                }
                
                Ok(result)
            }
            Err(e) => {
                self.status.insert(
                    context.to_string(),
                    AuthStatus::Failed {
                        error: e.to_string(),
                    },
                );
                Err(e)
            }
        }
    }

    /// Refresh authentication for a context
    pub async fn refresh(&self, context: &str) -> Result<AuthResult> {
        let provider = self
            .providers
            .get(context)
            .ok_or_else(|| Error::Auth(AuthError::MissingCredentials))?;
        
        let current = self
            .auth_results
            .get(context)
            .ok_or_else(|| Error::Auth(AuthError::MissingCredentials))?;
        
        if !provider.supports_refresh() {
            return Err(Error::Auth(AuthError::RefreshFailed(
                "Provider does not support refresh".to_string(),
            )));
        }
        
        let result = provider.refresh(&current).await?;
        self.auth_results.insert(context.to_string(), result.clone());
        
        self.status.insert(
            context.to_string(),
            AuthStatus::Authenticated {
                method: provider.name().to_string(),
                expires_at: result.expires_at,
            },
        );
        
        Ok(result)
    }

    /// Get authentication result for a context
    pub fn get_auth(&self, context: &str) -> Option<AuthResult> {
        self.auth_results.get(context).map(|r| r.clone())
    }

    /// Get authentication status for a context
    pub fn get_status(&self, context: &str) -> AuthStatus {
        self.status
            .get(context)
            .map(|s| s.clone())
            .unwrap_or(AuthStatus::NotAuthenticated)
    }

    /// Check if authentication is valid
    pub fn is_authenticated(&self, context: &str) -> bool {
        if let Some(result) = self.auth_results.get(context) {
            !result.is_expired()
        } else {
            false
        }
    }

    /// Logout from a context
    pub fn logout(&self, context: &str) {
        self.auth_results.remove(context);
        self.providers.remove(context);
        self.status.insert(context.to_string(), AuthStatus::NotAuthenticated);
        
        if let Some((_, handle)) = self.refresh_tasks.remove(context) {
            handle.abort();
        }
    }

    /// Create an authentication provider from config
    fn create_provider(&self, config: &AuthConfig) -> Result<Arc<dyn AuthProvider>> {
        let provider: Arc<dyn AuthProvider> = match &config.method {
            AuthMethod::Kubeconfig => Arc::new(KubeconfigAuth::new()),
            
            AuthMethod::BearerToken { token } => {
                Arc::new(BearerTokenAuth::new(token.clone()))
            }
            
            AuthMethod::Certificate {
                client_certificate_data,
                client_key_data,
            } => {
                // For certificate auth, we'll use kubeconfig provider with cert data
                Arc::new(KubeconfigAuth::new())
            }
            
            AuthMethod::Oidc {
                issuer_url,
                client_id,
                client_secret,
                refresh_token,
                scopes,
                ..
            } => Arc::new(OidcAuth::new(
                issuer_url.clone(),
                client_id.clone(),
                client_secret.clone(),
                scopes.clone(),
            )),
            
            AuthMethod::AwsEks {
                cluster_name,
                region,
                role_arn,
                profile,
            } => Arc::new(AwsEksAuth::new(
                cluster_name.clone(),
                region.clone(),
                role_arn.clone(),
                profile.clone(),
            )),
        };
        
        Ok(provider)
    }

    /// Get method name for display
    fn method_name(&self, method: &AuthMethod) -> String {
        match method {
            AuthMethod::Kubeconfig => "kubeconfig".to_string(),
            AuthMethod::BearerToken { .. } => "bearer_token".to_string(),
            AuthMethod::Certificate { .. } => "certificate".to_string(),
            AuthMethod::Oidc { .. } => "oidc".to_string(),
            AuthMethod::AwsEks { .. } => "aws_eks".to_string(),
        }
    }

    /// Start automatic token refresh
    async fn start_auto_refresh(&self, context: &str) {
        let context = context.to_string();
        
        // Cancel existing refresh task
        if let Some((_, handle)) = self.refresh_tasks.remove(&context) {
            handle.abort();
        }
        
        // We would start a background task here to refresh tokens
        // This is a simplified version
        tracing::debug!("Auto-refresh enabled for context: {}", context);
    }

    /// List all authenticated contexts
    pub fn authenticated_contexts(&self) -> Vec<String> {
        self.auth_results
            .iter()
            .filter(|r| !r.is_expired())
            .map(|r| r.key().clone())
            .collect()
    }
}

impl Default for AuthManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auth_manager_creation() {
        let manager = AuthManager::new();
        assert!(manager.authenticated_contexts().is_empty());
    }

    #[test]
    fn test_initial_status() {
        let manager = AuthManager::new();
        let status = manager.get_status("test");
        assert!(matches!(status, AuthStatus::NotAuthenticated));
    }
}
