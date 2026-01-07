//! Payment service layer

use chrono::{Duration, Utc};
use sea_orm::DatabaseConnection;
use sea_orm::entity::prelude::{DateTimeWithTimeZone, Decimal};
use uuid::Uuid;

use crate::db::entities::{Payment, PaymentStatus, SubscriptionType};
use crate::db::repositories::{licenses, payments};
use crate::error::{Error, Result};

pub struct PaymentService {
    pool: DatabaseConnection,
}

impl PaymentService {
    pub fn new(pool: DatabaseConnection) -> Self {
        Self { pool }
    }

    /// Get payment history for user with total count for pagination
    pub async fn get_history(
        &self,
        user_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<(Vec<Payment>, i64)> {
        let payments = payments::find_by_user_id(&self.pool, user_id, limit, offset).await?;
        let total = payments::count_by_user_id(&self.pool, user_id).await?;
        Ok((payments, total))
    }

    /// Check if payment already processed (for idempotency)
    pub async fn find_by_transaction_id(&self, transaction_id: &str) -> Result<Option<Payment>> {
        Ok(payments::find_by_transaction_id(&self.pool, transaction_id).await?)
    }

    fn parse_subscription_type(subscription_type: Option<&str>) -> Result<SubscriptionType> {
        let normalized = subscription_type
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_ascii_lowercase);

        match normalized.as_deref() {
            None => Ok(SubscriptionType::Monthly),
            Some("monthly") => Ok(SubscriptionType::Monthly),
            Some("lifetime") => Ok(SubscriptionType::Lifetime),
            Some(value) => Err(Error::Validation(format!(
                "Unsupported subscription_type: {value}"
            ))),
        }
    }

    /// Process webhook payment with license updates and idempotency
    #[allow(clippy::too_many_arguments)]
    pub async fn process_webhook(
        &self,
        user_id: Uuid,
        license_id: Option<Uuid>,
        amount: Decimal,
        currency: &str,
        status: PaymentStatus,
        transaction_id: String,
        payment_provider: Option<String>,
        subscription_type: Option<&str>,
    ) -> Result<(Payment, Option<Uuid>, bool)> {
        let transaction_id = transaction_id.trim().to_string();
        if transaction_id.is_empty() {
            return Err(Error::Validation("transaction_id is required".to_string()));
        }

        // Idempotency check
        if let Some(existing) = self.find_by_transaction_id(&transaction_id).await? {
            let existing_license_id = existing.license_id;
            return Ok((existing, existing_license_id, false));
        }

        let sub_type = Self::parse_subscription_type(subscription_type)?;
        let mut license_created = false;
        let mut final_license_id = license_id;

        if matches!(status, PaymentStatus::Completed) {
            let license = if let Some(id) = license_id {
                licenses::find_by_id_for_user(&self.pool, id, user_id)
                    .await?
                    .ok_or_else(|| Error::NotFound("License not found".to_string()))?;

                match sub_type {
                    SubscriptionType::Monthly => {
                        licenses::extend_monthly(&self.pool, id, user_id, 1).await?
                    }
                    SubscriptionType::Lifetime => {
                        licenses::upgrade_to_lifetime(&self.pool, id, user_id).await?
                    }
                }
            } else {
                let expires_at = match sub_type {
                    SubscriptionType::Monthly => {
                        let now: DateTimeWithTimeZone = Utc::now().into();
                        Some(now + Duration::days(30))
                    }
                    SubscriptionType::Lifetime => None,
                };

                let license_key = Uuid::new_v4().to_string();
                let new_license =
                    licenses::create(&self.pool, user_id, license_key, sub_type, expires_at)
                        .await
                        .map_err(|e| Error::Internal(format!("Failed to create license: {e}")))?;

                tracing::info!(
                    "Created license {} for user {} via webhook",
                    new_license.id,
                    user_id
                );
                license_created = true;
                new_license
            };

            final_license_id = Some(license.id);
        } else if matches!(status, PaymentStatus::Refunded) {
            if let Some(id) = license_id {
                let license = licenses::set_inactive(&self.pool, id, user_id).await?;
                final_license_id = Some(license.id);
            }
        } else if let Some(id) = license_id {
            let exists = licenses::find_by_id_for_user(&self.pool, id, user_id).await?;
            if exists.is_none() {
                return Err(Error::NotFound("License not found".to_string()));
            }
        }

        // Create payment record
        let payment = payments::create(
            &self.pool,
            user_id,
            final_license_id,
            amount,
            currency,
            status.clone(),
            Some(transaction_id),
            payment_provider,
        )
        .await
        .map_err(|e| Error::Internal(format!("Failed to create payment: {e}")))?;

        Ok((payment, final_license_id, license_created))
    }
}
