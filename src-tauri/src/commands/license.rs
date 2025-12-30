//! License and authentication commands

use crate::error::{Result, Error};
use crate::auth::license_client::{
    LicenseClient, LicenseStatus, 
    UserProfile, UpdateProfileRequest, PaymentHistoryResponse
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateLicenseRequest {
    pub license_key: String,
}

/// Login user
#[tauri::command]
pub async fn login_user(
    state: tauri::State<'_, LicenseClient>,
    email: String,
    password: String
) -> Result<()> {
    state.login(&email, &password).await?;
    Ok(())
}

/// Logout user (clears tokens from keychain)
#[tauri::command]
pub async fn logout_user(
    state: tauri::State<'_, LicenseClient>,
) -> Result<()> {
    state.clear_auth();
    Ok(())
}

/// Register new user
#[tauri::command]
pub async fn register_user(
    state: tauri::State<'_, LicenseClient>,
    email: String,
    password: String,
    first_name: Option<String>,
    last_name: Option<String>,
) -> Result<()> {
    state.register(&email, &password, first_name, last_name).await?;
    Ok(())
}

/// Check license status
#[tauri::command]
pub async fn check_license_status(
    state: tauri::State<'_, LicenseClient>,
    force_refresh: bool
) -> Result<LicenseStatus> {
    state.get_license_status(force_refresh).await
        .map_err(|e| Error::Internal(e.to_string()))
}

/// Activate license
#[tauri::command]
pub async fn activate_license(
    state: tauri::State<'_, LicenseClient>,
    license_key: String
) -> Result<LicenseStatus> {
    state.activate_license(&license_key).await
        .map_err(|e| Error::Internal(e.to_string()))
}

/// Check if license is valid (for premium features)
#[tauri::command]
pub async fn is_license_valid(
    state: tauri::State<'_, LicenseClient>,
) -> Result<bool> {
    state.check_license_valid().await
        .map_err(|e| Error::Internal(e.to_string()))
}

/// Get user profile
#[tauri::command]
pub async fn get_user_profile(
    state: tauri::State<'_, LicenseClient>,
) -> Result<UserProfile> {
    state.get_user_profile().await
        .map_err(|e| Error::Internal(e.to_string()))
}

/// Update user profile
#[tauri::command]
pub async fn update_user_profile(
    state: tauri::State<'_, LicenseClient>,
    first_name: Option<String>,
    last_name: Option<String>,
    company: Option<String>,
) -> Result<UserProfile> {
    let updates = UpdateProfileRequest {
        first_name,
        last_name,
        company,
    };
    
    state.update_user_profile(updates).await
        .map_err(|e| Error::Internal(e.to_string()))
}

/// Get payment history
#[tauri::command]
pub async fn get_payment_history(
    state: tauri::State<'_, LicenseClient>,
) -> Result<PaymentHistoryResponse> {
    state.get_payment_history().await
        .map_err(|e| Error::Internal(e.to_string()))
}
