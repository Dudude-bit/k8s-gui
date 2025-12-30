//! Common Data Transfer Objects (DTOs)
//!
//! This module provides shared request/response structures used across
//! all K8s GUI projects. These DTOs ensure consistency in the API contract
//! between the frontend, Tauri client, and auth server.

use serde::{Deserialize, Serialize};

/// Login request DTO
///
/// Used for authenticating users with email and password.
/// This structure is shared between the Tauri client and auth server.
///
/// # Examples
///
/// ```
/// use k8s_gui_common::dto::LoginRequest;
///
/// let request = LoginRequest {
///     email: "user@example.com".to_string(),
///     password: "secure_password".to_string(),
/// };
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    /// User's email address
    pub email: String,
    /// User's password
    pub password: String,
}

/// Register request DTO
///
/// Used for creating new user accounts with optional profile information.
/// This structure is shared between the Tauri client and auth server.
///
/// # Examples
///
/// ```
/// use k8s_gui_common::dto::RegisterRequest;
///
/// let request = RegisterRequest {
///     email: "user@example.com".to_string(),
///     password: "secure_password".to_string(),
///     first_name: Some("John".to_string()),
///     last_name: Some("Doe".to_string()),
///     company: None,
/// };
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    /// User's email address
    pub email: String,
    /// User's password (must meet password requirements)
    pub password: String,
    /// Optional first name
    pub first_name: Option<String>,
    /// Optional last name
    pub last_name: Option<String>,
    /// Optional company name
    pub company: Option<String>,
}

/// Activate license request DTO
///
/// Used for activating a license key for a user.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateLicenseRequest {
    /// License key in UUID format
    pub license_key: String,
}

/// Refresh token request DTO
///
/// Used for refreshing access tokens using a refresh token.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshRequest {
    /// Refresh token
    pub refresh_token: String,
}

/// Generic message response DTO
///
/// Used for simple responses that only contain a message.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageResponse {
    /// Response message
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_login_request_serialization() {
        let request = LoginRequest {
            email: "test@example.com".to_string(),
            password: "password123".to_string(),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("email"));
        assert!(json.contains("password"));

        let parsed: LoginRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.email, request.email);
    }

    #[test]
    fn test_register_request_serialization() {
        let request = RegisterRequest {
            email: "test@example.com".to_string(),
            password: "password123".to_string(),
            first_name: Some("John".to_string()),
            last_name: None,
            company: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("firstName")); // camelCase
        assert!(json.contains("John"));

        let parsed: RegisterRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.first_name, Some("John".to_string()));
    }
}

