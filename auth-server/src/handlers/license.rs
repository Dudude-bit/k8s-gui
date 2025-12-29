//! License handlers

use actix_web::{web, HttpResponse, Responder, HttpRequest};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use sqlx::PgPool;
use crate::error::{AppError, Result};
use crate::db::models::License;
use crate::db::models::AuditLog;
use crate::middleware::auth::get_user_id_from_http_request;
use crate::utils::validation::validate_license_key;
use chrono::{Duration, Utc};

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatusResponse {
    pub has_license: bool,
    pub license_key: Option<String>,
    pub subscription_type: Option<String>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub is_valid: bool,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ActivateLicenseRequest {
    pub license_key: String,
}

#[utoipa::path(
    get,
    path = "/api/v1/license/status",
    responses(
        (status = 200, description = "Get license status", body = LicenseStatusResponse)
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn get_status(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> Result<impl Responder> {
    let user_id = get_user_id_from_http_request(&req)
        .ok_or_else(|| AppError::Authentication("User not authenticated".to_string()))?;

    let license = License::find_by_user_id(pool.as_ref(), user_id).await?;

    let ip = req.connection_info().peer_addr()
        .map(|s| s.to_string());

    if let Some(ref lic) = license {
        let is_valid = lic.is_valid();
        AuditLog::log_license_check(pool.as_ref(), user_id, is_valid, ip.as_deref()).await.ok();
    }

    // Mask license keys in responses
    Ok(HttpResponse::Ok().json(LicenseStatusResponse {
        has_license: license.is_some(),
        license_key: license.as_ref().map(|l| l.masked_key()),
        subscription_type: license.as_ref().map(|l| l.subscription_type.to_string()),
        expires_at: license.as_ref().and_then(|l| l.expires_at),
        is_valid: license.as_ref().map(|l| l.is_valid()).unwrap_or(false),
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/license/activate",
    request_body = ActivateLicenseRequest,
    responses(
        (status = 200, description = "Activate license", body = LicenseStatusResponse)
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn activate(
    req: HttpRequest,
    body: web::Json<ActivateLicenseRequest>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder> {
    let user_id = get_user_id_from_http_request(&req)
        .ok_or_else(|| AppError::Authentication("User not authenticated".to_string()))?;

    // Validate license key format
    validate_license_key(&body.license_key)
        .map_err(|e| AppError::Validation(e.to_string()))?;

    // Find license by key
    let license = License::find_by_license_key(pool.as_ref(), &body.license_key).await?
        .ok_or_else(|| AppError::NotFound("License not found".to_string()))?;

    // CRITICAL FIX: Prevent license key reuse
    // Check if license was ever activated by another user (even if currently inactive)
    if license.user_id != user_id {
        return Err(AppError::Authorization(
            "This license key has already been activated by another user. Each license key can only be used once.".to_string()
        ));
    }

    // Check if license is already active for this user
    if license.is_active {
        // License is already active for this user, return current status
        return Ok(HttpResponse::Ok().json(LicenseStatusResponse {
            has_license: true,
            license_key: Some(license.masked_key()),
            subscription_type: Some(license.subscription_type.to_string()),
            expires_at: license.expires_at,
            is_valid: license.is_valid(),
        }));
    }

    // Issue #3 Fix: Check if license is expired and requires renewal
    // License is inactive but belongs to this user - check if expired
    if let Some(expires_at) = license.expires_at {
        if expires_at <= Utc::now() {
            // License expired - require payment verification for reactivation
            // In production, check for recent payment record here
            return Err(AppError::Authorization("License has expired. Please renew your subscription to reactivate.".to_string()));
        }
    }

    // Activate license for this user (license belongs to this user and is not expired)
    // Deactivate old licenses and activate this one
    // Issue #1 Fix: Preserve existing expiration date if still valid
    let expires_at = match license.subscription_type {
        crate::db::models::license::SubscriptionType::Monthly => {
            // Preserve existing expiration if still valid
            if let Some(existing_expiry) = license.expires_at {
                if existing_expiry > Utc::now() {
                    Some(existing_expiry) // Keep existing expiration
                } else {
                    Some(Utc::now() + Duration::days(30)) // Expired, start fresh
                }
            } else {
                Some(Utc::now() + Duration::days(30)) // No expiration, set new
            }
        },
        crate::db::models::license::SubscriptionType::Infinite => None,
    };
    // Use update_or_create to handle existing license with same key
    let new_license = License::activate_for_user(
        pool.as_ref(),
        user_id,
        license.id,
        expires_at,
    ).await?;

    Ok(HttpResponse::Ok().json(LicenseStatusResponse {
        has_license: true,
        license_key: Some(new_license.masked_key()),
        subscription_type: Some(new_license.subscription_type.to_string()),
        expires_at: new_license.expires_at,
        is_valid: new_license.is_valid(),
    }))
}

#[utoipa::path(
    get,
    path = "/api/v1/license/validate",
    params(
        ("license_key" = String, Query, description = "License key to validate")
    ),
    responses(
        (status = 200, description = "Validate license status")
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn validate(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> Result<impl Responder> {
    // Issue #6 Fix: Require authentication for license validation
    let user_id = get_user_id_from_http_request(&req)
        .ok_or_else(|| AppError::Authentication("Authentication required for license validation".to_string()))?;

    let license_key = query.get("license_key")
        .ok_or_else(|| AppError::Validation("license_key parameter required".to_string()))?;

    let license = License::find_by_license_key(pool.as_ref(), license_key).await?
        .ok_or_else(|| AppError::NotFound("License not found".to_string()))?;

    // Only allow users to validate their own licenses
    if license.user_id != user_id {
        return Err(AppError::Authorization("Not authorized to validate this license".to_string()));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "valid": license.is_valid(),
        "subscription_type": license.subscription_type.as_str(),
        "expires_at": license.expires_at,
    })))
}

