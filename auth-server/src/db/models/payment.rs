//! Payment model

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use bigdecimal::BigDecimal;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "payment_status", rename_all = "lowercase")]
pub enum PaymentStatus {
    Pending,
    Completed,
    Failed,
    Refunded,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Payment {
    pub id: Uuid,
    pub user_id: Uuid,
    pub license_id: Option<Uuid>,
    pub amount: BigDecimal,
    pub currency: String,
    pub payment_status: PaymentStatus,
    pub transaction_id: Option<String>,
    pub payment_provider: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl Payment {
    pub async fn find_by_user_id(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, Payment>(
            "SELECT id, user_id, license_id, amount, currency, payment_status, transaction_id, payment_provider, created_at 
             FROM payments 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2 OFFSET $3"
        )
        .bind(user_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    }

    /// Count total payments for a user (for pagination)
    pub async fn count_by_user_id(
        pool: &sqlx::PgPool,
        user_id: Uuid,
    ) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM payments WHERE user_id = $1"
        )
        .bind(user_id)
        .fetch_one(pool)
        .await
    }

    pub async fn create(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        license_id: Option<Uuid>,
        amount: BigDecimal,
        currency: &str,
        payment_status: PaymentStatus,
        transaction_id: Option<String>,
        payment_provider: Option<String>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Payment>(
            "INSERT INTO payments (user_id, license_id, amount, currency, payment_status, transaction_id, payment_provider) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING id, user_id, license_id, amount, currency, payment_status, transaction_id, payment_provider, created_at"
        )
        .bind(user_id)
        .bind(&license_id)
        .bind(amount)
        .bind(currency)
        .bind(payment_status)
        .bind(&transaction_id)
        .bind(&payment_provider)
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_transaction_id(
        pool: &sqlx::PgPool,
        transaction_id: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, Payment>(
            "SELECT id, user_id, license_id, amount, currency, payment_status, transaction_id, payment_provider, created_at 
             FROM payments 
             WHERE transaction_id = $1"
        )
        .bind(transaction_id)
        .fetch_optional(pool)
        .await
    }
}

