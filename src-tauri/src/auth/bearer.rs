//! Bearer token authentication

use super::{AuthProvider, AuthResult};
use crate::error::Result;
use async_trait::async_trait;

/// Bearer token authentication provider
pub struct BearerTokenAuth {
    token: String,
}

impl BearerTokenAuth {
    /// Create a new bearer token auth provider
    pub fn new(token: String) -> Self {
        Self { token }
    }
}

#[async_trait]
impl AuthProvider for BearerTokenAuth {
    async fn authenticate(&self) -> Result<AuthResult> {
        Ok(AuthResult {
            token: self.token.clone(),
            expires_at: None, // Bearer tokens typically don't have known expiry
            refresh_token: None,
            token_type: "Bearer".to_string(),
        })
    }

    async fn refresh(&self, _auth: &AuthResult) -> Result<AuthResult> {
        // Bearer tokens cannot be refreshed
        self.authenticate().await
    }

    fn supports_refresh(&self) -> bool {
        false
    }

    fn name(&self) -> &'static str {
        "bearer_token"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_bearer_token_auth() {
        let auth = BearerTokenAuth::new("test-token".to_string());
        let result = auth.authenticate().await.unwrap();
        
        assert_eq!(result.token, "test-token");
        assert_eq!(result.token_type, "Bearer");
        assert!(!auth.supports_refresh());
    }
}
