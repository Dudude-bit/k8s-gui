//! Payment handlers

use actix_web::{web, HttpResponse, Responder, HttpRequest};
use serde::{Deserialize, Serialize};
use utoipa::{ToSchema, IntoParams};
use sqlx::PgPool;
use uuid::Uuid;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use crate::config::Config;
use crate::error::{AppError, Result};
use crate::db::models::{Payment, License};
use crate::middleware::auth::get_user_id_from_http_request;

type HmacSha256 = Hmac<Sha256>;

/// Verify webhook signature using HMAC-SHA256
/// The signature should be passed in the `X-Webhook-Signature` header
fn verify_webhook_signature(payload: &[u8], signature: &str, secret: &str) -> bool {
    let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(payload);
    
    let Ok(signature_bytes) = hex::decode(signature) else {
        return false;
    };
    
    mac.verify_slice(&signature_bytes).is_ok()
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PaymentHistoryResponse {
    pub payments: Vec<PaymentInfo>,
    pub total: usize,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PaymentInfo {
    pub id: Uuid,
    pub license_id: Option<Uuid>,
    pub amount: String,
    pub currency: String,
    pub status: String,
    pub transaction_id: Option<String>,
    pub payment_provider: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[utoipa::path(
    get,
    path = "/api/v1/payments/history",
    responses(
        (status = 200, description = "List payment history", body = PaymentHistoryResponse)
    ),
    params(
        PaginationQuery
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn get_history(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    query: web::Query<PaginationQuery>,
) -> Result<impl Responder> {
    let user_id = get_user_id_from_http_request(&req)
        .ok_or_else(|| AppError::Authentication("User not authenticated".to_string()))?;

    let limit = query.limit.unwrap_or(50).min(100);
    let offset = query.offset.unwrap_or(0);

    let payments = Payment::find_by_user_id(pool.as_ref(), user_id, limit, offset).await?;

    let payment_infos: Vec<PaymentInfo> = payments.iter().map(|p| {
        PaymentInfo {
            id: p.id,
            license_id: p.license_id,
            amount: p.amount.to_string(),
            currency: p.currency.clone(),
            status: match p.payment_status {
                crate::db::models::payment::PaymentStatus::Pending => "pending",
                crate::db::models::payment::PaymentStatus::Completed => "completed",
                crate::db::models::payment::PaymentStatus::Failed => "failed",
                crate::db::models::payment::PaymentStatus::Refunded => "refunded",
            }.to_string(),
            transaction_id: p.transaction_id.clone(),
            payment_provider: p.payment_provider.clone(),
            created_at: p.created_at,
        }
    }).collect();

    Ok(HttpResponse::Ok().json(PaymentHistoryResponse {
        payments: payment_infos,
        total: payments.len(),
    }))
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct PaginationQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// Payment webhook handler for subscription renewals and initial purchases
#[derive(Debug, Deserialize)]
pub struct PaymentWebhookPayload {
    pub transaction_id: String,
    pub user_id: Option<Uuid>,
    /// License ID for renewals. If not provided and payment is completed, a new license will be created.
    pub license_id: Option<Uuid>,
    pub amount: String,
    pub currency: String,
    pub status: String,
    pub payment_provider: Option<String>,
    /// Subscription type for new licenses: "monthly" or "infinite"/"lifetime"
    pub subscription_type: Option<String>,
}

pub async fn handle_webhook(
    req: HttpRequest,
    body: web::Bytes,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> Result<impl Responder> {
    // Verify webhook signature if configured
    if let Some(ref secret) = config.webhook_secret {
        let signature = req.headers()
            .get("X-Webhook-Signature")
            .and_then(|h| h.to_str().ok())
            .ok_or_else(|| AppError::Authentication("Missing X-Webhook-Signature header".to_string()))?;
        
        if !verify_webhook_signature(&body, signature, secret) {
            log::warn!("Webhook signature verification failed");
            return Err(AppError::Authentication("Invalid webhook signature".to_string()));
        }
    } else {
        log::warn!("WEBHOOK_SECRET not configured - webhook signature verification is disabled!");
    }
    
    // Parse payload
    let payload: PaymentWebhookPayload = serde_json::from_slice(&body)
        .map_err(|e| AppError::Validation(format!("Invalid JSON payload: {}", e)))?;
    
    // Check if payment already processed (idempotency)
    if !payload.transaction_id.is_empty() {
        if let Ok(Some(existing_payment)) = Payment::find_by_transaction_id(pool.as_ref(), &payload.transaction_id).await {
            // Payment already processed
            return Ok(HttpResponse::Ok().json(serde_json::json!({
                "status": "already_processed",
                "payment_id": existing_payment.id
            })));
        }
    }

    let user_id = payload.user_id.ok_or_else(|| {
        AppError::Validation("user_id is required in webhook payload".to_string())
    })?;

    // Parse amount
    let amount = payload.amount.parse::<bigdecimal::BigDecimal>()
        .map_err(|_| AppError::Validation("Invalid amount format".to_string()))?;

    // Parse payment status
    let payment_status = match payload.status.as_str() {
        "completed" | "succeeded" | "paid" => crate::db::models::payment::PaymentStatus::Completed,
        "pending" => crate::db::models::payment::PaymentStatus::Pending,
        "failed" | "declined" => crate::db::models::payment::PaymentStatus::Failed,
        "refunded" => crate::db::models::payment::PaymentStatus::Refunded,
        _ => return Err(AppError::Validation(format!("Unknown payment status: {}", payload.status))),
    };

    // Determine license_id - create if not provided (initial purchase)
    let license_id = if let Some(id) = payload.license_id {
        id
    } else if matches!(payment_status, crate::db::models::payment::PaymentStatus::Completed) {
        // Initial purchase - create a new license
        let subscription_type = payload.subscription_type
            .as_deref()
            .unwrap_or("monthly");
        
        let sub_type = match subscription_type {
            "infinite" | "lifetime" => crate::db::models::license::SubscriptionType::Infinite,
            _ => crate::db::models::license::SubscriptionType::Monthly,
        };
        
        let expires_at = match sub_type {
            crate::db::models::license::SubscriptionType::Monthly => {
                Some(chrono::Utc::now() + chrono::Duration::days(30))
            },
            crate::db::models::license::SubscriptionType::Infinite => None,
        };
        
        // Generate license key
        let license_key = Uuid::new_v4().to_string();
        
        let new_license = License::create(
            pool.as_ref(),
            user_id,
            license_key,
            sub_type,
            expires_at,
        ).await.map_err(|e| AppError::Internal(format!("Failed to create license: {}", e)))?;
        
        log::info!("Created new license {} for user {} via payment webhook", new_license.id, user_id);
        new_license.id
    } else {
        return Err(AppError::Validation("license_id is required for non-completed payments".to_string()));
    };

    // Create payment record
    let payment = Payment::create(
        pool.as_ref(),
        user_id,
        Some(license_id),
        amount,
        &payload.currency,
        payment_status,
        Some(payload.transaction_id.clone()),
        payload.payment_provider.clone(),
    ).await.map_err(|e| AppError::Internal(format!("Failed to create payment record: {}", e)))?;

    // If payment is completed and license already existed, extend it
    if matches!(payment_status, crate::db::models::payment::PaymentStatus::Completed) && payload.license_id.is_some() {
        // Extend monthly license by 1 month
        if let Err(e) = License::extend_monthly(pool.as_ref(), license_id, user_id, 1).await {
            log::error!("Failed to extend license {} for user {}: {}", license_id, user_id, e);
            // Don't fail the webhook, but log the error
        }
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "processed",
        "payment_id": payment.id,
        "license_id": license_id,
        "license_created": payload.license_id.is_none()
    })))
}

