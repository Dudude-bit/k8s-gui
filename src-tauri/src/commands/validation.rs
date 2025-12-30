//! Validation commands
//!
//! Provides validation functions that can be called from the frontend.
//! All validation logic is centralized in k8s-gui-common to ensure consistency.

use crate::error::{Error, Result};
use k8s_gui_common::validation::{validate_email, validate_license_key, validate_password};

/// Validate email format
///
/// Returns Ok(()) if email is valid, Err(String) with error message otherwise.
#[tauri::command]
pub fn validate_email_command(email: String) -> Result<()> {
    validate_email(&email).map_err(|e| Error::InvalidInput(e))
}

/// Validate password strength
///
/// Returns Ok(()) if password meets requirements, Err(String) with error message otherwise.
#[tauri::command]
pub fn validate_password_command(password: String) -> Result<()> {
    validate_password(&password).map_err(|e| Error::InvalidInput(e))
}

/// Validate license key format (UUID)
///
/// Returns Ok(()) if license key is in valid UUID format, Err(String) with error message otherwise.
#[tauri::command]
pub fn validate_license_key_command(license_key: String) -> Result<()> {
    validate_license_key(&license_key).map_err(|e| Error::InvalidInput(e))
}
