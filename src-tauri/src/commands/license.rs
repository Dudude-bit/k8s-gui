//! License and authentication commands

use crate::error::{Result, Error};
use crate::auth::license_client::{LicenseClient, LicenseStatus, AuthTokens, UserProfile, UpdateProfileRequest, PaymentHistoryResponse};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

// Issue #19: Global license client
// NOTE: This is a global static shared across all requests. For a single-user desktop app (Tauri),
// this is acceptable. However, if multi-user support is added in the future, this should be moved
// to app state with per-user isolation to prevent token leakage between users.
// Current implementation is safe for single-user desktop applications.
static LICENSE_CLIENT: once_cell::sync::Lazy<Arc<RwLock<Option<LicenseClient>>>> = 
    once_cell::sync::Lazy::new(|| Arc::new(RwLock::new(None)));

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActivateLicenseRequest {
    pub license_key: String,
}

/// Initialize license client with auth server URL
#[tauri::command]
pub async fn init_license_client(auth_server_url: String) -> Result<()> {
    let client = LicenseClient::new(auth_server_url);
    *LICENSE_CLIENT.write().await = Some(client);
    Ok(())
}

/// Login user
#[tauri::command]
pub async fn login_user(email: String, password: String) -> Result<AuthTokens> {
    let client_guard = LICENSE_CLIENT.read().await;
    let client = client_guard.as_ref()
        .ok_or_else(|| Error::Internal("License client not initialized. Call init_license_client first.".to_string()))?;
    
    client.login(&email, &password).await
        .map_err(|e| Error::Internal(e.to_string()))
}

/// Register new user
#[tauri::command]
pub async fn register_user(
    email: String,
    password: String,
    first_name: Option<String>,
    last_name: Option<String>,
) -> Result<AuthTokens> {
    let client_guard = LICENSE_CLIENT.read().await;
    let client = client_guard.as_ref()
        .ok_or_else(|| Error::Internal("License client not initialized. Call init_license_client first.".to_string()))?;
    
    client.register(&email, &password, first_name, last_name).await
        .map_err(|e| Error::Internal(e.to_string()))
}

/// Check license status
#[tauri::command]
pub async fn check_license_status(force_refresh: bool) -> Result<LicenseStatus> {
    let client_guard = LICENSE_CLIENT.read().await;
    let client = client_guard.as_ref()
        .ok_or_else(|| Error::Internal("License client not initialized. Call init_license_client first.".to_string()))?;
    
    client.get_license_status(force_refresh).await
        .map_err(|e| Error::Internal(e.to_string()))
}

/// Activate license
#[tauri::command]
pub async fn activate_license(license_key: String) -> Result<LicenseStatus> {
    let client_guard = LICENSE_CLIENT.read().await;
    let client = client_guard.as_ref()
        .ok_or_else(|| Error::Internal("License client not initialized. Call init_license_client first.".to_string()))?;
    
    client.activate_license(&license_key).await
        .map_err(|e| Error::Internal(e.to_string()))
}

/// Check if license is valid (for premium features)
#[tauri::command]
pub async fn is_license_valid() -> Result<bool> {
    let client_guard = LICENSE_CLIENT.read().await;
    let client = client_guard.as_ref()
        .ok_or_else(|| Error::Internal("License client not initialized. Call init_license_client first.".to_string()))?;
    
    client.check_license_valid().await
        .map_err(|e| Error::Internal(e.to_string()))
}

/// Get user profile
#[tauri::command]
pub async fn get_user_profile() -> Result<UserProfile> {
    let client_guard = LICENSE_CLIENT.read().await;
    let client = client_guard.as_ref()
        .ok_or_else(|| Error::Internal("License client not initialized. Call init_license_client first.".to_string()))?;
    
    client.get_user_profile().await
        .map_err(|e| Error::Internal(e.to_string()))
}

/// Update user profile
#[tauri::command]
pub async fn update_user_profile(
    first_name: Option<String>,
    last_name: Option<String>,
    company: Option<String>,
) -> Result<UserProfile> {
    let client_guard = LICENSE_CLIENT.read().await;
    let client = client_guard.as_ref()
        .ok_or_else(|| Error::Internal("License client not initialized. Call init_license_client first.".to_string()))?;
    
    let updates = UpdateProfileRequest {
        first_name,
        last_name,
        company,
    };
    
    client.update_user_profile(updates).await
        .map_err(|e| Error::Internal(e.to_string()))
}

/// Get payment history
#[tauri::command]
pub async fn get_payment_history() -> Result<PaymentHistoryResponse> {
    let client_guard = LICENSE_CLIENT.read().await;
    let client = client_guard.as_ref()
        .ok_or_else(|| Error::Internal("License client not initialized. Call init_license_client first.".to_string()))?;
    
    client.get_payment_history().await
        .map_err(|e| Error::Internal(e.to_string()))
}

