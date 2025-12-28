//! License client for connecting to auth-server
//! 
//! Uses progenitor-generated client for type-safe API calls

use crate::auth::generated_client::{self, types};
use crate::error::{Error, Result};
use std::sync::Arc;
use tokio::sync::{RwLock, Mutex};

// Re-export generated types for external use
pub use types::{
    AuthResponse as AuthTokens,
    LicenseStatusResponse as LicenseStatus,
    ProfileResponse as UserProfile,
    UpdateProfileRequest,
    PaymentHistoryResponse,
    PaymentInfo,
};

pub struct LicenseClient {
    base_url: String,
    access_token: Arc<RwLock<Option<String>>>,
    refresh_token: Arc<RwLock<Option<String>>>,
    client: generated_client::Client,
    cached_status: Arc<RwLock<Option<(LicenseStatus, chrono::DateTime<chrono::Utc>)>>>,
    status_request: Arc<Mutex<Option<tokio::task::JoinHandle<Result<LicenseStatus>>>>>,
}

impl LicenseClient {
    pub fn new(base_url: String) -> Self {
        let client = generated_client::Client::new(&base_url);
        
        Self {
            base_url,
            access_token: Arc::new(RwLock::new(None)),
            refresh_token: Arc::new(RwLock::new(None)),
            client,
            cached_status: Arc::new(RwLock::new(None)),
            status_request: Arc::new(Mutex::new(None)),
        }
    }

    /// Creates an authenticated progenitor client with Bearer token
    fn create_authenticated_client(&self, token: &str) -> generated_client::Client {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token)).unwrap(),
        );
        let reqwest_client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .unwrap();
        generated_client::Client::new_with_client(&self.base_url, reqwest_client)
    }

    pub async fn login(&self, email: &str, password: &str) -> Result<AuthTokens> {
        let body = types::LoginRequest {
            email: email.to_string(),
            password: password.to_string(),
        };

        let response = self.client.login(&body).await
            .map_err(|e| Error::Internal(format!("Login failed: {}", e)))?;

        let tokens = response.into_inner();

        *self.access_token.write().await = Some(tokens.access_token.clone());
        *self.refresh_token.write().await = Some(tokens.refresh_token.clone());

        Ok(tokens)
    }

    pub async fn register(
        &self,
        email: &str,
        password: &str,
        first_name: Option<String>,
        last_name: Option<String>,
    ) -> Result<AuthTokens> {
        let body = types::RegisterRequest {
            email: email.to_string(),
            password: password.to_string(),
            first_name,
            last_name,
            company: None,
        };

        let response = self.client.register(&body).await
            .map_err(|e| Error::Internal(format!("Registration failed: {}", e)))?;

        let tokens = response.into_inner();

        *self.access_token.write().await = Some(tokens.access_token.clone());
        *self.refresh_token.write().await = Some(tokens.refresh_token.clone());

        Ok(tokens)
    }

    async fn ensure_token_valid(&self) -> Result<()> {
        let access_token = self.access_token.read().await.clone();
        if access_token.is_some() {
            return Ok(());
        }

        let refresh_token = self.refresh_token.read().await.clone();
        if let Some(ref token) = refresh_token {
            self.refresh_access_token(token).await?;
        } else {
            return Err(Error::Internal("Not authenticated".to_string()));
        }

        Ok(())
    }

    async fn refresh_access_token(&self, refresh_token: &str) -> Result<()> {
        let body = types::RefreshRequest {
            refresh_token: refresh_token.to_string(),
        };

        let response = self.client.refresh(&body).await
            .map_err(|e| Error::Internal(format!("Token refresh failed: {}", e)))?;

        let tokens = response.into_inner();

        *self.access_token.write().await = Some(tokens.access_token);
        *self.refresh_token.write().await = Some(tokens.refresh_token);

        Ok(())
    }

    pub async fn get_license_status(&self, force_refresh: bool) -> Result<LicenseStatus> {
        // Check cache first
        if !force_refresh {
            let cache_guard = self.cached_status.read().await;
            if let Some((status, cached_at)) = cache_guard.as_ref() {
                if cached_at > &(chrono::Utc::now() - chrono::Duration::hours(1)) {
                    return Ok(status.clone());
                }
            }
            drop(cache_guard);
        }

        // Check if request already in flight
        {
            let mut request_guard = self.status_request.lock().await;
            if let Some(handle) = request_guard.take() {
                drop(request_guard);
                return handle.await.map_err(|e| {
                    Error::Internal(format!("License status request failed: {:?}", e))
                })?;
            }
        }

        self.ensure_token_valid().await?;

        let access_token = self.access_token.read().await.clone()
            .ok_or_else(|| Error::Internal("Not authenticated".to_string()))?;

        let auth_client = self.create_authenticated_client(&access_token);
        let response = auth_client.get_status().await
            .map_err(|e| Error::Internal(format!("Failed to get license status: {}", e)))?;

        let status = response.into_inner();

        *self.cached_status.write().await = Some((status.clone(), chrono::Utc::now()));

        Ok(status)
    }

    pub async fn activate_license(&self, license_key: &str) -> Result<LicenseStatus> {
        self.ensure_token_valid().await?;

        *self.cached_status.write().await = None;

        let access_token = self.access_token.read().await.clone()
            .ok_or_else(|| Error::Internal("Not authenticated".to_string()))?;

        let body = types::ActivateLicenseRequest {
            license_key: license_key.to_string(),
        };

        let auth_client = self.create_authenticated_client(&access_token);
        let response = auth_client.activate(&body).await
            .map_err(|e| Error::Internal(format!("Failed to activate license: {}", e)))?;

        let status = response.into_inner();

        *self.cached_status.write().await = Some((status.clone(), chrono::Utc::now()));

        Ok(status)
    }

    pub async fn check_license_valid(&self) -> Result<bool> {
        let status = self.get_license_status(false).await?;
        Ok(status.is_valid)
    }

    pub fn clear_auth(&self) {
        let access_token = Arc::clone(&self.access_token);
        let refresh_token = Arc::clone(&self.refresh_token);
        let cached_status = Arc::clone(&self.cached_status);

        tokio::spawn(async move {
            *access_token.write().await = None;
            *refresh_token.write().await = None;
            *cached_status.write().await = None;
        });
    }

    pub async fn get_user_profile(&self) -> Result<UserProfile> {
        self.ensure_token_valid().await?;

        let access_token = self.access_token.read().await.clone()
            .ok_or_else(|| Error::Internal("Not authenticated".to_string()))?;

        let auth_client = self.create_authenticated_client(&access_token);
        let response = auth_client.get_profile().await
            .map_err(|e| Error::Internal(format!("Failed to get user profile: {}", e)))?;

        Ok(response.into_inner())
    }

    pub async fn update_user_profile(&self, updates: UpdateProfileRequest) -> Result<UserProfile> {
        self.ensure_token_valid().await?;

        let access_token = self.access_token.read().await.clone()
            .ok_or_else(|| Error::Internal("Not authenticated".to_string()))?;

        let auth_client = self.create_authenticated_client(&access_token);
        let response = auth_client.update_profile(&updates).await
            .map_err(|e| Error::Internal(format!("Failed to update user profile: {}", e)))?;

        Ok(response.into_inner())
    }

    pub async fn get_payment_history(&self) -> Result<PaymentHistoryResponse> {
        self.ensure_token_valid().await?;

        let access_token = self.access_token.read().await.clone()
            .ok_or_else(|| Error::Internal("Not authenticated".to_string()))?;

        let auth_client = self.create_authenticated_client(&access_token);
        let response = auth_client.get_history(None, None).await
            .map_err(|e| Error::Internal(format!("Failed to get payment history: {}", e)))?;

        Ok(response.into_inner())
    }
}
