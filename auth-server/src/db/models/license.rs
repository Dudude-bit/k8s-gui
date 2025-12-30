//! License model

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "subscription_type", rename_all = "lowercase")]
pub enum SubscriptionType {
    Monthly,
    Infinite,
}

impl SubscriptionType {
    /// Get the string representation of the subscription type
    pub fn as_str(&self) -> &'static str {
        match self {
            SubscriptionType::Monthly => "monthly",
            SubscriptionType::Infinite => "infinite",
        }
    }
}

impl std::fmt::Display for SubscriptionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct License {
    pub id: Uuid,
    pub user_id: Uuid,
    pub license_key: String,
    pub subscription_type: SubscriptionType,
    pub expires_at: Option<DateTime<Utc>>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl License {
    pub fn is_valid(&self) -> bool {
        if !self.is_active {
            return false;
        }

        match self.subscription_type {
            SubscriptionType::Infinite => true,
            SubscriptionType::Monthly => {
                if let Some(expires_at) = self.expires_at {
                    expires_at > Utc::now()
                } else {
                    false
                }
            }
        }
    }

    /// Get a masked version of the license key for safe display
    /// Shows only first 8 characters followed by "..."
    pub fn masked_key(&self) -> String {
        if self.license_key.len() > 8 {
            format!("{}...", &self.license_key[..8])
        } else {
            "***".to_string()
        }
    }

    pub async fn find_by_user_id(
        pool: &sqlx::PgPool,
        user_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, License>(
            "SELECT id, user_id, license_key, subscription_type, expires_at, is_active, created_at, updated_at 
             FROM licenses 
             WHERE user_id = $1 AND is_active = TRUE 
             ORDER BY created_at DESC 
             LIMIT 1"
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_license_key(
        pool: &sqlx::PgPool,
        license_key: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, License>(
            "SELECT id, user_id, license_key, subscription_type, expires_at, is_active, created_at, updated_at 
             FROM licenses 
             WHERE license_key = $1"
        )
        .bind(license_key)
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        license_key: String,
        subscription_type: SubscriptionType,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<Self, sqlx::Error> {
        // Use a transaction to ensure atomicity - if insert fails, deactivation is rolled back
        let mut tx = pool.begin().await?;

        // Deactivate all existing licenses for this user
        sqlx::query("UPDATE licenses SET is_active = FALSE WHERE user_id = $1")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;

        let license = sqlx::query_as::<_, License>(
            "INSERT INTO licenses (user_id, license_key, subscription_type, expires_at, is_active) 
             VALUES ($1, $2, $3, $4, TRUE) 
             RETURNING id, user_id, license_key, subscription_type, expires_at, is_active, created_at, updated_at"
        )
        .bind(user_id)
        .bind(&license_key)
        .bind(subscription_type)
        .bind(&expires_at)
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(license)
    }

    pub async fn extend_monthly(
        pool: &sqlx::PgPool,
        license_id: Uuid,
        user_id: Uuid,
        months: i32,
    ) -> Result<(), sqlx::Error> {
        // Issue #4 Fix: Validate license exists, belongs to user, and is active
        let license = sqlx::query_as::<_, License>(
            "SELECT id, user_id, license_key, subscription_type, expires_at, is_active, created_at, updated_at 
             FROM licenses 
             WHERE id = $1"
        )
        .bind(license_id)
        .fetch_optional(pool)
        .await?;

        let license = license.ok_or_else(|| sqlx::Error::RowNotFound)?;

        // Verify ownership
        if license.user_id != user_id {
            return Err(sqlx::Error::RowNotFound);
        }

        // Verify license is active
        if !license.is_active {
            return Err(sqlx::Error::RowNotFound);
        }

        // Verify subscription type
        if !matches!(license.subscription_type, SubscriptionType::Monthly) {
            return Err(sqlx::Error::RowNotFound);
        }

        // Issue #13 Fix: Use safer interval construction with chrono
        let base_date = license
            .expires_at
            .filter(|exp| *exp > Utc::now())
            .unwrap_or_else(Utc::now);

        let new_expires_at = base_date
            .checked_add_signed(chrono::Duration::days(30 * months as i64))
            .ok_or_else(|| sqlx::Error::RowNotFound)?;

        sqlx::query(
            "UPDATE licenses 
             SET expires_at = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND subscription_type = 'monthly' AND is_active = TRUE",
        )
        .bind(new_expires_at)
        .bind(license_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Activate an existing license for a user (deactivate other licenses first)
    pub async fn activate_for_user(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        license_id: Uuid,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<Self, sqlx::Error> {
        // Use a transaction to ensure atomicity
        let mut tx = pool.begin().await?;

        // First, get the license to check subscription type
        let license = sqlx::query_as::<_, License>(
            "SELECT id, user_id, license_key, subscription_type, expires_at, is_active, created_at, updated_at 
             FROM licenses 
             WHERE id = $1"
        )
        .bind(license_id)
        .fetch_optional(&mut *tx)
        .await?;

        let license = license.ok_or_else(|| sqlx::Error::RowNotFound)?;

        // Issue #5 Fix: Always set expires_at to NULL for infinite licenses
        let final_expires_at = match license.subscription_type {
            SubscriptionType::Infinite => None, // Always None for infinite
            SubscriptionType::Monthly => expires_at, // Use provided value for monthly
        };

        // Deactivate all existing licenses for this user
        sqlx::query("UPDATE licenses SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;

        // Activate the specified license
        let activated_license = sqlx::query_as::<_, License>(
            "UPDATE licenses 
             SET user_id = $1, is_active = TRUE, expires_at = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING id, user_id, license_key, subscription_type, expires_at, is_active, created_at, updated_at"
        )
        .bind(user_id)
        .bind(&final_expires_at)
        .bind(license_id)
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(activated_license)
    }
}
