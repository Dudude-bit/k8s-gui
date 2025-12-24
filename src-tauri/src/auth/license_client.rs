//! License client for connecting to auth-server

use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{RwLock, Mutex};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub has_license: bool,
    pub license_key: Option<String>,
    pub subscription_type: Option<String>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub is_valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: i64,
}

pub struct LicenseClient {
    base_url: String,
    // Issue #8: Token storage in memory
    // NOTE: Tokens are stored in plain Arc<RwLock<Option<String>>> without encryption.
    // For a desktop Tauri app, this is acceptable but not ideal. In production, consider:
    // 1. Using Tauri's secure storage plugin (tauri-plugin-store) for token persistence
    // 2. Encrypting tokens in memory using OS keychain/credential store
    // 3. Minimizing token lifetime and clearing when not needed
    // Current implementation is functional but tokens are accessible in memory dumps.
    access_token: Arc<RwLock<Option<String>>>,
    refresh_token: Arc<RwLock<Option<String>>>,
    client: reqwest::Client,
    cached_status: Arc<RwLock<Option<(LicenseStatus, chrono::DateTime<chrono::Utc>)>>>,
    // Issue #10 Fix: Track in-flight requests to prevent race conditions
    status_request: Arc<Mutex<Option<tokio::task::JoinHandle<Result<LicenseStatus>>>>>,
}

impl LicenseClient {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url,
            access_token: Arc::new(RwLock::new(None)),
            refresh_token: Arc::new(RwLock::new(None)),
            client: reqwest::Client::new(),
            cached_status: Arc::new(RwLock::new(None)),
            status_request: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn login(&self, email: &str, password: &str) -> Result<AuthTokens> {
        let response = self.client
            .post(&format!("{}/api/v1/auth/login", self.base_url))
            .json(&serde_json::json!({
                "email": email,
                "password": password
            }))
            .send()
            .await
            .map_err(|e| Error::Internal(format!("Failed to send login request: {}", e)))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(Error::Internal(format!("Login failed: {}", error_text)));
        }

        let tokens: AuthTokens = response.json().await
            .map_err(|e| Error::Internal(format!("Failed to parse response: {}", e)))?;

        *self.access_token.write().await = Some(tokens.access_token.clone());
        *self.refresh_token.write().await = Some(tokens.refresh_token.clone());

        Ok(tokens)
    }

    pub async fn register(&self, email: &str, password: &str, first_name: Option<String>, last_name: Option<String>) -> Result<AuthTokens> {
        let response = self.client
            .post(&format!("{}/api/v1/auth/register", self.base_url))
            .json(&serde_json::json!({
                "email": email,
                "password": password,
                "first_name": first_name,
                "last_name": last_name
            }))
            .send()
            .await
            .map_err(|e| Error::Internal(format!("Failed to send register request: {}", e)))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(Error::Internal(format!("Registration failed: {}", error_text)));
        }

        let tokens: AuthTokens = response.json().await
            .map_err(|e| Error::Internal(format!("Failed to parse response: {}", e)))?;

        *self.access_token.write().await = Some(tokens.access_token.clone());
        *self.refresh_token.write().await = Some(tokens.refresh_token.clone());

        Ok(tokens)
    }

    async fn ensure_token_valid(&self) -> Result<()> {
        let access_token = self.access_token.read().await.clone();
        if access_token.is_some() {
            return Ok(());
        }

        // Try to refresh
        let refresh_token = self.refresh_token.read().await.clone();
        if let Some(ref token) = refresh_token {
            self.refresh_access_token(token).await?;
        } else {
            return Err(Error::Internal("Not authenticated".to_string()));
        }

        Ok(())
    }

    async fn refresh_access_token(&self, refresh_token: &str) -> Result<()> {
        let response = self.client
            .post(&format!("{}/api/v1/auth/refresh", self.base_url))
            .json(&serde_json::json!({
                "refresh_token": refresh_token
            }))
            .send()
            .await
            .map_err(|e| Error::Internal(format!("Failed to refresh token: {}", e)))?;

        if !response.status().is_success() {
            return Err(Error::Internal("Token refresh failed".to_string()));
        }

        let tokens: AuthTokens = response.json().await
            .map_err(|e| Error::Internal(format!("Failed to parse response: {}", e)))?;

        *self.access_token.write().await = Some(tokens.access_token);
        *self.refresh_token.write().await = Some(tokens.refresh_token);

        Ok(())
    }

    pub async fn get_license_status(&self, force_refresh: bool) -> Result<LicenseStatus> {
        // Issue #10 Fix: Check cache first with proper locking
        if !force_refresh {
            let cache_guard = self.cached_status.read().await;
            if let Some((status, cached_at)) = cache_guard.as_ref() {
                // Cache valid for 1 hour
                if cached_at > &(chrono::Utc::now() - chrono::Duration::hours(1)) {
                    return Ok(status.clone());
                }
            }
            drop(cache_guard); // Release read lock
        }

        // Issue #10 Fix: Check if request already in flight
        {
            let mut request_guard = self.status_request.lock().await;
            if let Some(handle) = request_guard.take() {
                // Wait for existing request
                drop(request_guard);
                return handle.await.map_err(|e| {
                    Error::Internal(format!("License status request failed: {:?}", e))
                })?;
            }
        }

        // Prepare for new request
        self.ensure_token_valid().await?;

        let access_token = self.access_token.read().await.clone()
            .ok_or_else(|| Error::Internal("Not authenticated".to_string()))?;

        let base_url = self.base_url.clone();
        let client = self.client.clone();
        let cached_status = Arc::clone(&self.cached_status);
        let status_request = Arc::clone(&self.status_request);

        // Start new request
        let handle = tokio::spawn(async move {
            let result = async {
                let response = client
                    .get(&format!("{}/api/v1/license/status", base_url))
                    .header("Authorization", format!("Bearer {}", access_token))
                    .send()
                    .await
                    .map_err(|e| Error::Internal(format!("Failed to get license status: {}", e)))?;

                if !response.status().is_success() {
                    return Err(Error::Internal("Failed to get license status".to_string()));
                }

                let status: LicenseStatus = response.json().await
                    .map_err(|e| Error::Internal(format!("Failed to parse response: {}", e)))?;

                // Update cache
                *cached_status.write().await = Some((status.clone(), chrono::Utc::now()));

                Ok(status)
            }.await;

            // Clear the in-flight request regardless of success/failure
            let _ = status_request.lock().await.take();
            
            result
        });

        // Store handle
        {
            let mut request_guard = self.status_request.lock().await;
            *request_guard = Some(handle);
        }

        // Wait for the request we just started
        let mut request_guard = self.status_request.lock().await;
        if let Some(handle) = request_guard.take() {
            drop(request_guard);
            handle.await.map_err(|e| {
                Error::Internal(format!("License status request failed: {:?}", e))
            })?
        } else {
            Err(Error::Internal("Failed to start license status request".to_string()))
        }
    }

    pub async fn activate_license(&self, license_key: &str) -> Result<LicenseStatus> {
        self.ensure_token_valid().await?;

        // Issue #11 Fix: Always clear cache before activation attempt
        *self.cached_status.write().await = None;

        let access_token = self.access_token.read().await.clone()
            .ok_or_else(|| Error::Internal("Not authenticated".to_string()))?;

        let response = self.client
            .post(&format!("{}/api/v1/license/activate", self.base_url))
            .header("Authorization", format!("Bearer {}", access_token))
            .json(&serde_json::json!({
                "license_key": license_key
            }))
            .send()
            .await
            .map_err(|e| {
                // Issue #11 Fix: Cache already cleared, error will force refresh
                Error::Internal(format!("Failed to activate license: {}", e))
            })?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            // Issue #11 Fix: Cache already cleared on error, will force refresh on next check
            return Err(Error::Internal(format!("License activation failed: {}", error_text)));
        }

        let status: LicenseStatus = response.json().await
            .map_err(|e| Error::Internal(format!("Failed to parse response: {}", e)))?;

        // Update cache with new status
        *self.cached_status.write().await = Some((status.clone(), chrono::Utc::now()));

        Ok(status)
    }

    pub async fn check_license_valid(&self) -> Result<bool> {
        let status = self.get_license_status(false).await?;
        Ok(status.is_valid)
    }

    pub fn clear_auth(&self) {
        // Clone Arc references to clear tokens in spawned task
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

        let response = self.client
            .get(&format!("{}/api/v1/user/profile", self.base_url))
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| Error::Internal(format!("Failed to get user profile: {}", e)))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(Error::Internal(format!("Failed to get user profile: {}", error_text)));
        }

        let profile: UserProfile = response.json().await
            .map_err(|e| Error::Internal(format!("Failed to parse response: {}", e)))?;

        Ok(profile)
    }

    pub async fn update_user_profile(&self, updates: UpdateProfileRequest) -> Result<UserProfile> {
        self.ensure_token_valid().await?;

        let access_token = self.access_token.read().await.clone()
            .ok_or_else(|| Error::Internal("Not authenticated".to_string()))?;

        let response = self.client
            .put(&format!("{}/api/v1/user/profile", self.base_url))
            .header("Authorization", format!("Bearer {}", access_token))
            .json(&updates)
            .send()
            .await
            .map_err(|e| Error::Internal(format!("Failed to update user profile: {}", e)))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(Error::Internal(format!("Failed to update user profile: {}", error_text)));
        }

        let profile: UserProfile = response.json().await
            .map_err(|e| Error::Internal(format!("Failed to parse response: {}", e)))?;

        Ok(profile)
    }

    pub async fn get_payment_history(&self) -> Result<PaymentHistoryResponse> {
        self.ensure_token_valid().await?;

        let access_token = self.access_token.read().await.clone()
            .ok_or_else(|| Error::Internal("Not authenticated".to_string()))?;

        let response = self.client
            .get(&format!("{}/api/v1/payments/history", self.base_url))
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| Error::Internal(format!("Failed to get payment history: {}", e)))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(Error::Internal(format!("Failed to get payment history: {}", error_text)));
        }

        let history: PaymentHistoryResponse = response.json().await
            .map_err(|e| Error::Internal(format!("Failed to parse response: {}", e)))?;

        Ok(history)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub user_id: uuid::Uuid,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company: Option<String>,
    pub email_verified: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateProfileRequest {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentHistoryResponse {
    pub payments: Vec<PaymentInfo>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentInfo {
    pub id: uuid::Uuid,
    pub license_id: Option<uuid::Uuid>,
    pub amount: String,
    pub currency: String,
    pub status: String,
    pub transaction_id: Option<String>,
    pub payment_provider: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

