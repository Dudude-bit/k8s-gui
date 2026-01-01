//! Authentication service
//!
//! This module provides user authentication, registration, and token management.
//! It uses common DTOs from k8s_gui_common for consistency with the Tauri client.

use crate::config::Config;
use crate::db::repositories::{refresh_tokens, user_profiles, users};
use crate::error::{Error, Result};
use crate::utils::jwt::{hash_refresh_token, JwtService};
use crate::utils::password::{hash_password, verify_password};
use chrono::{Duration, Utc};
use k8s_gui_common::validation::{validate_email, validate_password};
use sea_orm::entity::prelude::DateTimeWithTimeZone;
use sea_orm::DatabaseConnection;
use serde::Serialize;
use uuid::Uuid;

// Re-export common DTOs
pub use k8s_gui_common::{LoginRequest, MessageResponse, RefreshRequest, RegisterRequest};

/// Authentication response with tokens
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub user_id: Uuid,
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: i64,
}

pub struct AuthService {
    pool: DatabaseConnection,
    config: Config,
}

impl AuthService {
    pub fn new(pool: DatabaseConnection, config: Config) -> Self {
        Self { pool, config }
    }

    pub async fn register(&self, req: RegisterRequest) -> Result<AuthResponse> {
        // Validate email and password using common validation utilities
        validate_email(&req.email).map_err(Error::Validation)?;
        validate_password(&req.password).map_err(Error::Validation)?;

        // Check if user already exists
        if users::find_by_email(&self.pool, &req.email)
            .await?
            .is_some()
        {
            return Err(Error::Validation(
                "User with this email already exists".to_string(),
            ));
        }

        // Hash password
        let password_hash = hash_password(&req.password)
            .map_err(|e| Error::Internal(format!("Failed to hash password: {e}")))?;

        // Create user
        let user = users::create(&self.pool, &req.email, &password_hash).await?;

        // Create profile if provided
        if req.first_name.is_some() || req.last_name.is_some() || req.company.is_some() {
            user_profiles::create(
                &self.pool,
                user.id,
                req.first_name.clone(),
                req.last_name.clone(),
                req.company.clone(),
            )
            .await?;
        }

        // Generate tokens
        let jwt_service = JwtService::new(
            &self.config.jwt_secret,
            self.config.jwt_expiry as i64,
            self.config.refresh_token_expiry as i64,
        );

        let access_token = jwt_service
            .generate_access_token(user.id)
            .map_err(|e| Error::Internal(format!("Failed to generate token: {e}")))?;
        let refresh_token = jwt_service
            .generate_refresh_token(user.id)
            .map_err(|e| Error::Internal(format!("Failed to generate refresh token: {e}")))?;

        // Store refresh token
        let token_hash = hash_refresh_token(&refresh_token);
        let expires_at: DateTimeWithTimeZone =
            (Utc::now() + Duration::seconds(self.config.refresh_token_expiry as i64)).into();
        refresh_tokens::create(&self.pool, user.id, token_hash, expires_at).await?;

        Ok(AuthResponse {
            user_id: user.id,
            access_token,
            refresh_token,
            token_type: "Bearer".to_string(),
            expires_in: self.config.jwt_expiry as i64,
        })
    }

    pub async fn login(&self, req: LoginRequest) -> Result<AuthResponse> {
        // Find user
        let user = users::find_by_email(&self.pool, &req.email)
            .await?
            .ok_or_else(|| Error::Authentication("Invalid email or password".to_string()))?;

        // Check if account is locked
        if users::is_locked(&user) {
            return Err(Error::Authentication(
                "Account is locked. Please try again later.".to_string(),
            ));
        }

        // Verify password
        let password_valid = verify_password(&req.password, &user.password_hash)
            .map_err(|e| Error::Internal(format!("Failed to verify password: {e}")))?;

        if !password_valid {
            users::increment_failed_login_attempts(&self.pool, user.id)
                .await
                .ok();
            return Err(Error::Authentication(
                "Invalid email or password".to_string(),
            ));
        }

        // Reset failed attempts
        users::reset_failed_login_attempts(&self.pool, user.id)
            .await
            .ok();

        // Delete all existing refresh tokens for this user to prevent token accumulation
        // This also invalidates all other sessions for security
        if let Ok(deleted) = refresh_tokens::delete_all_for_user(&self.pool, user.id).await {
            if deleted > 0 {
                tracing::debug!(
                    "Deleted {} old refresh tokens for user {}",
                    deleted,
                    user.id
                );
            }
        }

        // Generate tokens
        let jwt_service = JwtService::new(
            &self.config.jwt_secret,
            self.config.jwt_expiry as i64,
            self.config.refresh_token_expiry as i64,
        );

        let access_token = jwt_service
            .generate_access_token(user.id)
            .map_err(|e| Error::Internal(format!("Failed to generate token: {e}")))?;
        let refresh_token = jwt_service
            .generate_refresh_token(user.id)
            .map_err(|e| Error::Internal(format!("Failed to generate refresh token: {e}")))?;

        // Store refresh token
        let token_hash = hash_refresh_token(&refresh_token);
        let expires_at: DateTimeWithTimeZone =
            (Utc::now() + Duration::seconds(self.config.refresh_token_expiry as i64)).into();
        refresh_tokens::create(&self.pool, user.id, token_hash, expires_at).await?;

        Ok(AuthResponse {
            user_id: user.id,
            access_token,
            refresh_token,
            token_type: "Bearer".to_string(),
            expires_in: self.config.jwt_expiry as i64,
        })
    }

    pub async fn refresh(&self, req: RefreshRequest) -> Result<AuthResponse> {
        let jwt_service = JwtService::new(
            &self.config.jwt_secret,
            self.config.jwt_expiry as i64,
            self.config.refresh_token_expiry as i64,
        );

        // Validate refresh token JWT signature and claims
        let user_id = jwt_service
            .validate_refresh_token(&req.refresh_token)
            .map_err(|_| Error::Authentication("Invalid refresh token".to_string()))?;

        // Atomically consume the refresh token from database
        // This prevents race conditions where the same token could be used twice
        let token_hash = hash_refresh_token(&req.refresh_token);

        let consumed_user_id = refresh_tokens::consume(&self.pool, &token_hash)
            .await?
            .ok_or_else(|| {
                Error::Authentication("Invalid or already used refresh token".to_string())
            })?;

        // Verify the user_id from JWT matches the one in database
        if consumed_user_id != user_id {
            return Err(Error::Authentication("Token mismatch".to_string()));
        }

        // Generate new tokens
        let access_token = jwt_service
            .generate_access_token(user_id)
            .map_err(|e| Error::Internal(format!("Failed to generate token: {e}")))?;
        let refresh_token = jwt_service
            .generate_refresh_token(user_id)
            .map_err(|e| Error::Internal(format!("Failed to generate refresh token: {e}")))?;

        // Store new refresh token
        let new_token_hash = hash_refresh_token(&refresh_token);
        let expires_at: DateTimeWithTimeZone =
            (Utc::now() + Duration::seconds(self.config.refresh_token_expiry as i64)).into();
        refresh_tokens::create(&self.pool, user_id, new_token_hash, expires_at).await?;

        Ok(AuthResponse {
            user_id,
            access_token,
            refresh_token,
            token_type: "Bearer".to_string(),
            expires_in: self.config.jwt_expiry as i64,
        })
    }

    pub async fn logout(&self, req: RefreshRequest) -> Result<MessageResponse> {
        let token_hash = hash_refresh_token(&req.refresh_token);
        refresh_tokens::delete(&self.pool, &token_hash).await?;

        Ok(MessageResponse {
            message: "Logged out successfully".to_string(),
        })
    }

    /// Validate access token and return user ID
    pub fn validate_access_token(&self, token: &str) -> Result<Uuid> {
        let jwt_service = JwtService::new(
            &self.config.jwt_secret,
            self.config.jwt_expiry as i64,
            self.config.refresh_token_expiry as i64,
        );

        jwt_service
            .validate_access_token(token)
            .map_err(|e| Error::Authentication(format!("Invalid token: {e}")))
    }

    /// Extract user ID from gRPC request metadata
    #[allow(clippy::result_large_err)]
    pub fn extract_user_id_from_request<T>(
        &self,
        request: &tonic::Request<T>,
    ) -> std::result::Result<Uuid, tonic::Status> {
        let token = request
            .metadata()
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer "))
            .ok_or_else(|| {
                tonic::Status::unauthenticated("Missing or invalid authorization header")
            })?;

        self.validate_access_token(token)
            .map_err(|e| tonic::Status::unauthenticated(format!("Invalid token: {e}")))
    }
}
