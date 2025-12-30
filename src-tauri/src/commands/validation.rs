//! Validation commands
//!
//! Provides validation functions that can be called from the frontend.
//! All validation logic is centralized in k8s-gui-common to ensure consistency
//! across all projects (src-tauri, auth-server, and frontend).

use crate::error::{Error, Result};
use k8s_gui_common::validation::{validate_email, validate_license_key, validate_password};

/// Validate email format
///
/// This command uses `k8s_gui_common::validation::validate_email` for validation,
/// ensuring consistency with auth-server and other parts of the application.
///
/// # Arguments
///
/// * `email` - Email address to validate
///
/// # Returns
///
/// Returns `Ok(())` if email is valid, `Err(Error::InvalidInput)` with error message otherwise.
#[tauri::command]
pub fn validate_email_command(email: String) -> Result<()> {
    validate_email(&email).map_err(|e| Error::InvalidInput(e))
}

/// Validate password strength
///
/// This command uses `k8s_gui_common::validation::validate_password` for validation,
/// ensuring consistency with auth-server and other parts of the application.
///
/// # Arguments
///
/// * `password` - Password to validate
///
/// # Returns
///
/// Returns `Ok(())` if password meets requirements, `Err(Error::InvalidInput)` with error message otherwise.
#[tauri::command]
pub fn validate_password_command(password: String) -> Result<()> {
    validate_password(&password).map_err(|e| Error::InvalidInput(e))
}

/// Validate license key format (UUID)
///
/// This command uses `k8s_gui_common::validation::validate_license_key` for validation,
/// ensuring consistency with auth-server and other parts of the application.
///
/// # Arguments
///
/// * `license_key` - License key to validate (must be in UUID format)
///
/// # Returns
///
/// Returns `Ok(())` if license key is in valid UUID format, `Err(Error::InvalidInput)` with error message otherwise.
#[tauri::command]
pub fn validate_license_key_command(license_key: String) -> Result<()> {
    validate_license_key(&license_key).map_err(|e| Error::InvalidInput(e))
}
