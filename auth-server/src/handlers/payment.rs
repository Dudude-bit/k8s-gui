//! Payment handlers

use actix_web::{web, HttpResponse, Responder, HttpRequest};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use crate::error::{AppError, Result};
use crate::db::models::{Payment, License};
use crate::middleware::auth::get_user_id_from_http_request;

#[derive(Debug, Serialize)]
pub struct PaymentHistoryResponse {
    pub payments: Vec<PaymentInfo>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
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

#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// Issue #2 Fix: Payment webhook handler for subscription renewals
#[derive(Debug, Deserialize)]
pub struct PaymentWebhookPayload {
    pub transaction_id: String,
    pub user_id: Option<Uuid>,
    pub license_id: Option<Uuid>,
    pub amount: String,
    pub currency: String,
    pub status: String,
    pub payment_provider: Option<String>,
    pub signature: Option<String>, // For webhook signature verification
}

pub async fn handle_webhook(
    req: HttpRequest,
    body: web::Json<PaymentWebhookPayload>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder> {
    // TODO: Verify webhook signature here (e.g., Stripe signature verification)
    // For now, we'll trust the payload but in production this must be verified
    
    let payload = body.into_inner();
    
    // Check if payment already processed (idempotency)
    if let Some(ref transaction_id) = payload.transaction_id {
        if let Ok(Some(existing_payment)) = Payment::find_by_transaction_id(pool.as_ref(), transaction_id).await {
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

    let license_id = payload.license_id.ok_or_else(|| {
        AppError::Validation("license_id is required in webhook payload".to_string())
    })?;

    // Parse amount
    let amount = payload.amount.parse::<rust_decimal::Decimal>()
        .map_err(|_| AppError::Validation("Invalid amount format".to_string()))?;

    // Parse payment status
    let payment_status = match payload.status.as_str() {
        "completed" | "succeeded" | "paid" => crate::db::models::payment::PaymentStatus::Completed,
        "pending" => crate::db::models::payment::PaymentStatus::Pending,
        "failed" | "declined" => crate::db::models::payment::PaymentStatus::Failed,
        "refunded" => crate::db::models::payment::PaymentStatus::Refunded,
        _ => return Err(AppError::Validation(format!("Unknown payment status: {}", payload.status))),
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
        payload.payment_provider.as_deref(),
    ).await.map_err(|e| AppError::Internal(format!("Failed to create payment record: {}", e)))?;

    // If payment is completed, extend the license
    if matches!(payment_status, crate::db::models::payment::PaymentStatus::Completed) {
        // Extend monthly license by 1 month
        if let Err(e) = License::extend_monthly(pool.as_ref(), license_id, user_id, 1).await {
            log::error!("Failed to extend license {} for user {}: {}", license_id, user_id, e);
            // Don't fail the webhook, but log the error
        }
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "processed",
        "payment_id": payment.id,
        "license_extended": matches!(payment_status, crate::db::models::payment::PaymentStatus::Completed)
    })))
}

