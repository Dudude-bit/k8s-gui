//! Authentication handlers

use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use validator::Validate;
use crate::config::Config;
use crate::db::models::{User, UserProfile};
use crate::error::{AppError, Result};
use crate::utils::jwt::{JwtService, hash_refresh_token};
use crate::utils::password::{hash_password, verify_password, validate_password_strength};
use crate::utils::validation::validate_email;
use crate::db::models::AuditLog;
use chrono::{Duration, Utc};

#[derive(Debug, Deserialize, Validate)]
pub struct RegisterRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 8, max = 128))]
    pub password: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub new_password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: i64,
}

#[derive(Debug, Serialize)]
pub struct MessageResponse {
    pub message: String,
}

pub async fn register(
    req: web::Json<RegisterRequest>,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> Result<impl Responder> {
    let req = req.into_inner();
    
    // Validate input
    req.validate()?;

    validate_email(&req.email)?;
    validate_password_strength(&req.password)
        .map_err(|e| AppError::Validation(e.to_string()))?;

    // Check if user already exists
    if User::find_by_email(pool.as_ref(), &req.email).await?.is_some() {
        return Err(AppError::Validation("User with this email already exists".to_string()));
    }

    // Hash password
    let password_hash = hash_password(&req.password)
        .map_err(|e| AppError::Internal(format!("Failed to hash password: {}", e)))?;

    // Create user
    let user = User::create(pool.as_ref(), &req.email, &password_hash).await?;

    // Create profile if provided
    if req.first_name.is_some() || req.last_name.is_some() || req.company.is_some() {
        UserProfile::create(
            pool.as_ref(),
            user.id,
            req.first_name.clone(),
            req.last_name.clone(),
            req.company.clone(),
        ).await?;
    }

    // Generate tokens
    let jwt_service = JwtService::new(
        &config.jwt_secret,
        config.jwt_expiry as i64,
        config.refresh_token_expiry as i64,
    );

    let access_token = jwt_service.generate_access_token(user.id)
        .map_err(|e| AppError::Internal(format!("Failed to generate token: {}", e)))?;
    let refresh_token = jwt_service.generate_refresh_token(user.id)
        .map_err(|e| AppError::Internal(format!("Failed to generate refresh token: {}", e)))?;

    // Store refresh token hash
    let token_hash = hash_refresh_token(&refresh_token);
    sqlx::query(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) 
         VALUES ($1, $2, $3)"
    )
    .bind(user.id)
    .bind(&token_hash)
    .bind(Utc::now() + Duration::seconds(config.refresh_token_expiry as i64))
    .execute(pool.as_ref())
    .await?;

    Ok(HttpResponse::Created().json(AuthResponse {
        access_token,
        refresh_token,
        token_type: "Bearer".to_string(),
        expires_in: config.jwt_expiry as i64,
    }))
}

pub async fn login(
    req: web::Json<LoginRequest>,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    req_info: actix_web::HttpRequest,
) -> Result<impl Responder> {
    // Get IP and user agent
    let ip = req_info.connection_info().peer_addr()
        .map(|s| s.to_string());
    let user_agent = req_info.headers().get("user-agent")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string());

    // Find user
    let user = User::find_by_email(pool.as_ref(), &req.email).await?
        .ok_or_else(|| AppError::Authentication("Invalid email or password".to_string()))?;

    // Check if account is locked
    if user.is_locked() {
        AuditLog::log_login_attempt(pool.as_ref(), Some(user.id), &req.email, false, ip.as_deref(), user_agent.as_deref()).await.ok();
        return Err(AppError::Authentication("Account is locked. Please try again later.".to_string()));
    }

    // Verify password
    let password_valid = verify_password(&req.password, &user.password_hash)
        .map_err(|e| AppError::Internal(format!("Failed to verify password: {}", e)))?;

    if !password_valid {
        User::increment_failed_login_attempts(pool.as_ref(), user.id).await.ok();
        AuditLog::log_login_attempt(pool.as_ref(), Some(user.id), &req.email, false, ip.as_deref(), user_agent.as_deref()).await.ok();
        return Err(AppError::Authentication("Invalid email or password".to_string()));
    }

    // Reset failed attempts
    User::reset_failed_login_attempts(pool.as_ref(), user.id).await.ok();

    // Generate tokens
    let jwt_service = JwtService::new(
        &config.jwt_secret,
        config.jwt_expiry as i64,
        config.refresh_token_expiry as i64,
    );

    let access_token = jwt_service.generate_access_token(user.id)
        .map_err(|e| AppError::Internal(format!("Failed to generate token: {}", e)))?;
    let refresh_token = jwt_service.generate_refresh_token(user.id)
        .map_err(|e| AppError::Internal(format!("Failed to generate refresh token: {}", e)))?;

    // Store refresh token hash
    let token_hash = hash_refresh_token(&refresh_token);
    sqlx::query(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) 
         VALUES ($1, $2, $3)"
    )
    .bind(user.id)
    .bind(&token_hash)
    .bind(Utc::now() + Duration::seconds(config.refresh_token_expiry as i64))
    .execute(pool.as_ref())
    .await?;

    // Log successful login
    AuditLog::log_login_attempt(&pool, Some(user.id), &req.email, true, ip.as_deref(), user_agent.as_deref()).await.ok();

    Ok(HttpResponse::Ok().json(AuthResponse {
        access_token,
        refresh_token,
        token_type: "Bearer".to_string(),
        expires_in: config.jwt_expiry as i64,
    }))
}

pub async fn refresh(
    req: web::Json<RefreshRequest>,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> Result<impl Responder> {
    let jwt_service = JwtService::new(
        &config.jwt_secret,
        config.jwt_expiry as i64,
        config.refresh_token_expiry as i64,
    );

    // Validate refresh token
    let user_id = jwt_service.validate_refresh_token(&req.refresh_token)
        .map_err(|_| AppError::Authentication("Invalid refresh token".to_string()))?;

    // Check if token exists in database
    let token_hash = hash_refresh_token(&req.refresh_token);
    let token_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM refresh_tokens WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP)"
    )
    .bind(&token_hash)
    .fetch_one(pool.as_ref())
    .await?;

    if !token_exists {
        return Err(AppError::Authentication("Invalid refresh token".to_string()));
    }

    // Generate new tokens
    let access_token = jwt_service.generate_access_token(user_id)
        .map_err(|e| AppError::Internal(format!("Failed to generate token: {}", e)))?;
    let refresh_token = jwt_service.generate_refresh_token(user_id)
        .map_err(|e| AppError::Internal(format!("Failed to generate refresh token: {}", e)))?;

    // Delete old refresh token and store new one
    sqlx::query("DELETE FROM refresh_tokens WHERE token_hash = $1")
        .bind(&token_hash)
        .execute(pool.as_ref())
        .await?;

    let new_token_hash = hash_refresh_token(&refresh_token);
    sqlx::query(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) 
         VALUES ($1, $2, $3)"
    )
    .bind(user_id)
    .bind(&new_token_hash)
    .bind(Utc::now() + Duration::seconds(config.refresh_token_expiry as i64))
    .execute(pool.as_ref())
    .await?;

    Ok(HttpResponse::Ok().json(AuthResponse {
        access_token,
        refresh_token,
        token_type: "Bearer".to_string(),
        expires_in: config.jwt_expiry as i64,
    }))
}

pub async fn logout(
    req: web::Json<RefreshRequest>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder> {
    let token_hash = hash_refresh_token(&req.refresh_token);
    sqlx::query("DELETE FROM refresh_tokens WHERE token_hash = $1")
        .bind(&token_hash)
        .execute(pool.as_ref())
        .await?;

    Ok(HttpResponse::Ok().json(MessageResponse {
        message: "Logged out successfully".to_string(),
    }))
}

pub async fn forgot_password(
    req: web::Json<ForgotPasswordRequest>,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> Result<impl Responder> {
    // Don't reveal if user exists
    if let Some(user) = User::find_by_email(pool.as_ref(), &req.email).await? {
        // Generate reset token
        use rand::Rng;
        use sha2::{Sha256, Digest};
        use base64::Engine;
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
        sqlx::query(
            "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) 
             VALUES ($1, $2, $3)
             ON CONFLICT (token_hash) DO UPDATE SET expires_at = $3, used = FALSE"
        )
        .bind(user.id)
        .bind(&token_hash)
        .bind(expires_at)
        .execute(pool.as_ref())
        .await?;

        // In a real implementation, send password reset email with token
        // For now, just log it (in production, send email)
        log::info!("Password reset token generated for user: {} (token: {})", user.id, token);
    }

    Ok(HttpResponse::Ok().json(MessageResponse {
        message: "If an account exists with this email, a password reset link has been sent".to_string(),
    }))
}

pub async fn reset_password(
    req: web::Json<ResetPasswordRequest>,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> Result<impl Responder> {
    // Validate password strength
    validate_password_strength(&req.new_password)
        .map_err(|e| AppError::Validation(e.to_string()))?;

    // Hash the provided token to look it up
    use sha2::{Sha256, Digest};
    let token_hash = {
        let mut hasher = Sha256::new();
        hasher.update(req.token.as_bytes());
        format!("{:x}", hasher.finalize())
    };

    // Find valid, unused token
    #[derive(sqlx::FromRow)]
    struct TokenRecord {
        user_id: Uuid,
        expires_at: DateTime<Utc>,
        used: bool,
    }

    let token_record = sqlx::query_as::<_, TokenRecord>(
        "SELECT user_id, expires_at, used 
         FROM password_reset_tokens 
         WHERE token_hash = $1 AND used = FALSE AND expires_at > CURRENT_TIMESTAMP"
    )
    .bind(&token_hash)
    .fetch_optional(pool.as_ref())
    .await?
    .ok_or_else(|| AppError::Authentication("Invalid or expired reset token".to_string()))?;

    // Get user
    let user = User::find_by_id(pool.as_ref(), token_record.user_id).await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    // Hash new password
    let password_hash = hash_password(&req.new_password)
        .map_err(|e| AppError::Internal(format!("Failed to hash password: {}", e)))?;

    // Update user password
    sqlx::query(
        "UPDATE users 
         SET password_hash = $1, updated_at = CURRENT_TIMESTAMP, 
             failed_login_attempts = 0, locked_until = NULL
         WHERE id = $2"
    )
    .bind(&password_hash)
    .bind(user.id)
    .execute(pool.as_ref())
    .await?;

    // Mark token as used
    sqlx::query(
        "UPDATE password_reset_tokens SET used = TRUE WHERE token_hash = $1"
    )
    .bind(&token_hash)
    .execute(pool.as_ref())
    .await?;

    // Log password reset
    AuditLog::log_password_reset(pool.as_ref(), user.id, None, None).await.ok();

    Ok(HttpResponse::Ok().json(MessageResponse {
        message: "Password reset successfully".to_string(),
    }))
}

