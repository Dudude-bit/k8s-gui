use sqlx::PgPool;
use crate::config::Config;
use crate::error::{AppError, Result};
use crate::db::models::{User, UserProfile, AuditLog, token::{RefreshToken, PasswordResetToken}};
use crate::utils::jwt::{JwtService, hash_refresh_token};
use crate::utils::password::{hash_password, verify_password, validate_password_strength};
use crate::utils::validation::validate_email;
use validator::Validate;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use chrono::{Duration, Utc};
use base64::Engine;
use rand::Rng;
use sha2::{Sha256, Digest};

#[derive(Debug, Deserialize, Validate, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 8, max = 128))]
    pub password: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResetPasswordRequest {
    pub token: String,
    pub new_password: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: i64,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MessageResponse {
    pub message: String,
}

pub struct AuthService {
    pool: PgPool,
    config: Config,
}

impl AuthService {
    pub fn new(pool: PgPool, config: Config) -> Self {
        Self { pool, config }
    }

    pub async fn register(&self, req: RegisterRequest) -> Result<AuthResponse> {
        req.validate()?;

        validate_email(&req.email)?;
        validate_password_strength(&req.password)
            .map_err(|e| AppError::Validation(e.to_string()))?;

        // Check if user already exists
        if User::find_by_email(&self.pool, &req.email).await?.is_some() {
            return Err(AppError::Validation("User with this email already exists".to_string()));
        }

        // Hash password
        let password_hash = hash_password(&req.password)
            .map_err(|e| AppError::Internal(format!("Failed to hash password: {}", e)))?;

        // Create user
        let user = User::create(&self.pool, &req.email, &password_hash).await?;

        // Create profile if provided
        if req.first_name.is_some() || req.last_name.is_some() || req.company.is_some() {
            UserProfile::create(
                &self.pool,
                user.id,
                req.first_name.clone(),
                req.last_name.clone(),
                req.company.clone(),
            ).await?;
        }

        // Generate tokens
        let jwt_service = JwtService::new(
            &self.config.jwt_secret,
            self.config.jwt_expiry as i64,
            self.config.refresh_token_expiry as i64,
        );

        let access_token = jwt_service.generate_access_token(user.id)
            .map_err(|e| AppError::Internal(format!("Failed to generate token: {}", e)))?;
        let refresh_token = jwt_service.generate_refresh_token(user.id)
            .map_err(|e| AppError::Internal(format!("Failed to generate refresh token: {}", e)))?;

        // Store refresh token
        let token_hash = hash_refresh_token(&refresh_token);
        let expires_at = Utc::now() + Duration::seconds(self.config.refresh_token_expiry as i64);
        RefreshToken::create(&self.pool, user.id, token_hash, expires_at).await?;

        Ok(AuthResponse {
            access_token,
            refresh_token,
            token_type: "Bearer".to_string(),
            expires_in: self.config.jwt_expiry as i64,
        })
    }

    pub async fn login(&self, req: LoginRequest, ip: Option<String>, user_agent: Option<String>) -> Result<AuthResponse> {
        // Find user
        let user = User::find_by_email(&self.pool, &req.email).await?
            .ok_or_else(|| AppError::Authentication("Invalid email or password".to_string()))?;

        // Check if account is locked
        if user.is_locked() {
            AuditLog::log_login_attempt(&self.pool, Some(user.id), &req.email, false, ip.as_deref(), user_agent.as_deref()).await.ok();
            return Err(AppError::Authentication("Account is locked. Please try again later.".to_string()));
        }

        // Verify password
        let password_valid = verify_password(&req.password, &user.password_hash)
            .map_err(|e| AppError::Internal(format!("Failed to verify password: {}", e)))?;

        if !password_valid {
            User::increment_failed_login_attempts(&self.pool, user.id).await.ok();
            AuditLog::log_login_attempt(&self.pool, Some(user.id), &req.email, false, ip.as_deref(), user_agent.as_deref()).await.ok();
            return Err(AppError::Authentication("Invalid email or password".to_string()));
        }

        // Reset failed attempts
        User::reset_failed_login_attempts(&self.pool, user.id).await.ok();

        // Generate tokens
        let jwt_service = JwtService::new(
            &self.config.jwt_secret,
            self.config.jwt_expiry as i64,
            self.config.refresh_token_expiry as i64,
        );

        let access_token = jwt_service.generate_access_token(user.id)
            .map_err(|e| AppError::Internal(format!("Failed to generate token: {}", e)))?;
        let refresh_token = jwt_service.generate_refresh_token(user.id)
            .map_err(|e| AppError::Internal(format!("Failed to generate refresh token: {}", e)))?;

        // Store refresh token
        let token_hash = hash_refresh_token(&refresh_token);
        let expires_at = Utc::now() + Duration::seconds(self.config.refresh_token_expiry as i64);
        RefreshToken::create(&self.pool, user.id, token_hash, expires_at).await?;

        // Log successful login
        AuditLog::log_login_attempt(&self.pool, Some(user.id), &req.email, true, ip.as_deref(), user_agent.as_deref()).await.ok();

        Ok(AuthResponse {
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

        // Validate refresh token
        let user_id = jwt_service.validate_refresh_token(&req.refresh_token)
            .map_err(|_| AppError::Authentication("Invalid refresh token".to_string()))?;

        // Check if token exists in database
        let token_hash = hash_refresh_token(&req.refresh_token);
        
        if !RefreshToken::exists(&self.pool, &token_hash).await? {
            return Err(AppError::Authentication("Invalid refresh token".to_string()));
        }

        // Generate new tokens
        let access_token = jwt_service.generate_access_token(user_id)
            .map_err(|e| AppError::Internal(format!("Failed to generate token: {}", e)))?;
        let refresh_token = jwt_service.generate_refresh_token(user_id)
            .map_err(|e| AppError::Internal(format!("Failed to generate refresh token: {}", e)))?;

        // Delete old refresh token and store new one
        RefreshToken::delete(&self.pool, &token_hash).await?;

        let new_token_hash = hash_refresh_token(&refresh_token);
        let expires_at = Utc::now() + Duration::seconds(self.config.refresh_token_expiry as i64);
        RefreshToken::create(&self.pool, user_id, new_token_hash, expires_at).await?;

        Ok(AuthResponse {
            access_token,
            refresh_token,
            token_type: "Bearer".to_string(),
            expires_in: self.config.jwt_expiry as i64,
        })
    }

    pub async fn logout(&self, req: RefreshRequest) -> Result<MessageResponse> {
        let token_hash = hash_refresh_token(&req.refresh_token);
        RefreshToken::delete(&self.pool, &token_hash).await?;

        Ok(MessageResponse {
            message: "Logged out successfully".to_string(),
        })
    }

    pub async fn forgot_password(&self, req: ForgotPasswordRequest) -> Result<MessageResponse> {
        // Don't reveal if user exists
        if let Some(user) = User::find_by_email(&self.pool, &req.email).await? {
            // Generate reset token
            let mut rng = rand::thread_rng();
            let token_bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
            let token = base64::engine::general_purpose::STANDARD.encode(&token_bytes);
            let token_hash = {
                let mut hasher = Sha256::new();
                hasher.update(token.as_bytes());
                format!("{:x}", hasher.finalize())
            };

            // Store token in database (expires in 1 hour)
            let expires_at = Utc::now() + Duration::hours(1);
            PasswordResetToken::create(&self.pool, user.id, token_hash, expires_at).await?;

            // TODO: Send password reset email with token
            // In production, integrate with email service (e.g., AWS SES, SendGrid)
            // For now, the token is stored but email is not sent
            log::info!("Password reset requested for user: {}", user.id);
        }

        Ok(MessageResponse {
            message: "If an account exists with this email, a password reset link has been sent".to_string(),
        })
    }

    pub async fn reset_password(&self, req: ResetPasswordRequest) -> Result<MessageResponse> {
        // Validate password strength
        validate_password_strength(&req.new_password)
            .map_err(|e| AppError::Validation(e.to_string()))?;

        // Hash the provided token to look it up
        let token_hash = {
            let mut hasher = Sha256::new();
            hasher.update(req.token.as_bytes());
            format!("{:x}", hasher.finalize())
        };

        // Find valid, unused token
        let token_record = PasswordResetToken::find_valid(&self.pool, &token_hash).await?
            .ok_or_else(|| AppError::Authentication("Invalid or expired reset token".to_string()))?;

        // Get user
        let user = User::find_by_id(&self.pool, token_record.user_id).await?
            .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

        // Hash new password
        let password_hash = hash_password(&req.new_password)
            .map_err(|e| AppError::Internal(format!("Failed to hash password: {}", e)))?;

        // Update user password
        User::update_password(&self.pool, user.id, &password_hash).await?;

        // Mark token as used
        PasswordResetToken::mark_used(&self.pool, &token_hash).await?;

        // Log password reset
        AuditLog::log_password_reset(&self.pool, user.id, None, None).await.ok();

        Ok(MessageResponse {
            message: "Password reset successfully".to_string(),
        })
    }
}
