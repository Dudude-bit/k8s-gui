//! Payment gRPC service implementation

use crate::config::Config;
use crate::db::entities::PaymentStatus;
use crate::proto::payment::{
    payment_service_server::PaymentService, GetHistoryRequest, PaymentHistoryResponse, PaymentInfo,
    WebhookRequest, WebhookResponse,
};
use crate::services::auth::AuthService;
use crate::services::payment::PaymentService as PaymentBusinessService;
use crate::utils::validation::validate_pagination;
use hmac::{Hmac, Mac};
use prost_types::Timestamp;
use sha2::Sha256;
use std::sync::Arc;
use tonic::{Request, Response, Status};
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

pub struct PaymentGrpcService {
    service: Arc<PaymentBusinessService>,
    auth_service: Arc<AuthService>,
    config: Arc<Config>,
}

impl PaymentGrpcService {
    pub fn new(
        service: Arc<PaymentBusinessService>,
        auth_service: Arc<AuthService>,
        config: Arc<Config>,
    ) -> Self {
        Self {
            service,
            auth_service,
            config,
        }
    }

    fn datetime_to_timestamp(dt: chrono::DateTime<chrono::Utc>) -> Timestamp {
        Timestamp {
            seconds: dt.timestamp(),
            nanos: dt.timestamp_subsec_nanos() as i32,
        }
    }

    fn verify_webhook_signature(&self, payload: &[u8], signature: &str) -> bool {
        let Some(ref secret) = self.config.webhook_secret else {
            tracing::error!("WEBHOOK_SECRET not configured - rejecting webhook request");
            return false;
        };

        let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) else {
            return false;
        };
        mac.update(payload);

        let Ok(signature_bytes) = hex::decode(signature) else {
            return false;
        };

        mac.verify_slice(&signature_bytes).is_ok()
    }
}

#[tonic::async_trait]
impl PaymentService for PaymentGrpcService {
    async fn get_history(
        &self,
        request: Request<GetHistoryRequest>,
    ) -> Result<Response<PaymentHistoryResponse>, Status> {
        let user_id = self.auth_service.extract_user_id_from_request(&request)?;
        let req = request.into_inner();

        // Validate and sanitize pagination parameters
        let (limit, offset) = validate_pagination(req.limit, req.offset, 100);

        let (payments, total) = self
            .service
            .get_history(user_id, limit, offset)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let payment_infos: Vec<PaymentInfo> = payments
            .iter()
            .map(|p| PaymentInfo {
                id: p.id.to_string(),
                license_id: p.license_id.map(|id| id.to_string()),
                amount: p.amount.to_string(),
                currency: p.currency.clone(),
                status: match p.payment_status {
                    PaymentStatus::Pending => "pending",
                    PaymentStatus::Completed => "completed",
                    PaymentStatus::Failed => "failed",
                    PaymentStatus::Refunded => "refunded",
                }
                .to_string(),
                transaction_id: p.transaction_id.clone(),
                payment_provider: p.payment_provider.clone(),
                created_at: Some(Self::datetime_to_timestamp(p.created_at)),
            })
            .collect();

        Ok(Response::new(PaymentHistoryResponse {
            payments: payment_infos,
            total,
        }))
    }

    async fn process_webhook(
        &self,
        request: Request<WebhookRequest>,
    ) -> Result<Response<WebhookResponse>, Status> {
        let req = request.into_inner();

        // Verify signature using raw_payload if provided, otherwise fallback to reconstructed payload
        // Note: Using raw_payload is strongly recommended for accurate signature verification
        let payload = if !req.raw_payload.is_empty() {
            req.raw_payload.clone()
        } else {
            tracing::warn!("Webhook request missing raw_payload - using reconstructed payload (may cause signature mismatch)");
            serde_json::to_vec(&serde_json::json!({
                "transaction_id": req.transaction_id,
                "user_id": req.user_id,
                "license_id": req.license_id,
                "amount": req.amount,
                "currency": req.currency,
                "status": req.status,
            }))
            .unwrap_or_default()
        };

        if !self.verify_webhook_signature(&payload, &req.signature) {
            return Err(Status::unauthenticated("Invalid webhook signature"));
        }

        let user_id = req
            .user_id
            .and_then(|s| Uuid::parse_str(&s).ok())
            .ok_or_else(|| Status::invalid_argument("user_id required"))?;

        let license_id = req.license_id.and_then(|s| Uuid::parse_str(&s).ok());

        let amount = req
            .amount
            .parse()
            .map_err(|_| Status::invalid_argument("Invalid amount"))?;

        let status = match req.status.as_str() {
            "completed" | "succeeded" | "paid" => PaymentStatus::Completed,
            "pending" => PaymentStatus::Pending,
            "failed" | "declined" => PaymentStatus::Failed,
            "refunded" => PaymentStatus::Refunded,
            _ => return Err(Status::invalid_argument("Unknown status")),
        };

        let (payment, final_license_id, created) = self
            .service
            .process_webhook(
                user_id,
                license_id,
                amount,
                &req.currency,
                status,
                req.transaction_id,
                req.payment_provider,
                req.subscription_type.as_deref(),
            )
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(WebhookResponse {
            status: "processed".to_string(),
            payment_id: payment.id.to_string(),
            license_id: Some(final_license_id.to_string()),
            license_created: created,
        }))
    }
}
