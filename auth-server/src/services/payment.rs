//! Payment service layer

use bigdecimal::BigDecimal;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::models::license::SubscriptionType;
use crate::db::models::payment::PaymentStatus;
use crate::db::models::{License, Payment};
use crate::error::{Error, Result};

pub struct PaymentService {
    pool: PgPool,
}

impl PaymentService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Get payment history for user with total count for pagination
    pub async fn get_history(
        &self,
        user_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<(Vec<Payment>, i64)> {
        let payments = Payment::find_by_user_id(&self.pool, user_id, limit, offset).await?;
        let total = Payment::count_by_user_id(&self.pool, user_id).await?;
        Ok((payments, total))
    }

    /// Check if payment already processed (for idempotency)
    pub async fn find_by_transaction_id(&self, transaction_id: &str) -> Result<Option<Payment>> {
        Ok(Payment::find_by_transaction_id(&self.pool, transaction_id).await?)
    }

    /// Process webhook payment with license creation/extension
    pub async fn process_webhook(
        &self,
        user_id: Uuid,
        license_id: Option<Uuid>,
        amount: BigDecimal,
        currency: &str,
        status: PaymentStatus,
        transaction_id: String,
        payment_provider: Option<String>,
        subscription_type: Option<&str>,
    ) -> Result<(Payment, Uuid, bool)> {
        // Idempotency check
        if !transaction_id.is_empty() {
            if let Some(existing) = self.find_by_transaction_id(&transaction_id).await? {
                return Err(Error::Validation(format!(
                    "Payment already processed: {}",
                    existing.id
                )));
            }
        }

        // Determine license_id - create if not provided
        let (final_license_id, license_created) = if let Some(id) = license_id {
            (id, false)
        } else if matches!(status, PaymentStatus::Completed) {
            // Create new license
            let sub_type = match subscription_type.unwrap_or("monthly") {
                "infinite" | "lifetime" => SubscriptionType::Infinite,
                _ => SubscriptionType::Monthly,
            };

            let expires_at = match sub_type {
                SubscriptionType::Monthly => Some(chrono::Utc::now() + chrono::Duration::days(30)),
                SubscriptionType::Infinite => None,
            };

            let license_key = Uuid::new_v4().to_string();
            let new_license =
                License::create(&self.pool, user_id, license_key, sub_type, expires_at)
                    .await
                    .map_err(|e| Error::Internal(format!("Failed to create license: {}", e)))?;

            tracing::info!(
                "Created license {} for user {} via webhook",
                new_license.id,
                user_id
            );
            (new_license.id, true)
        } else {
            return Err(Error::Validation(
                "license_id required for non-completed payments".to_string(),
            ));
        };

        // Create payment record
        let payment = Payment::create(
            &self.pool,
            user_id,
            Some(final_license_id),
            amount,
            currency,
            status.clone(),
            Some(transaction_id),
            payment_provider,
        )
        .await
        .map_err(|e| Error::Internal(format!("Failed to create payment: {}", e)))?;

        // Extend existing license if payment completed
        if matches!(status, PaymentStatus::Completed) && license_id.is_some() {
            if let Err(e) = License::extend_monthly(&self.pool, final_license_id, user_id, 1).await
            {
                tracing::error!("Failed to extend license {}: {}", final_license_id, e);
            }
        }

        Ok((payment, final_license_id, license_created))
    }
}
