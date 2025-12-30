//! License service layer

use chrono::{Duration, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::models::license::SubscriptionType;
use crate::db::models::{AuditLog, License};
use crate::error::{Error, Result};

pub struct LicenseService {
    pool: PgPool,
}

impl LicenseService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Get license status for a user
    pub async fn get_status(&self, user_id: Uuid, ip: Option<&str>) -> Result<Option<License>> {
        let license = License::find_by_user_id(&self.pool, user_id).await?;

        // Log the license check
        if let Some(ref lic) = license {
            let is_valid = lic.is_valid();
            AuditLog::log_license_check(&self.pool, user_id, is_valid, ip)
                .await
                .ok();
        }

        Ok(license)
    }

    /// Activate license for user
    pub async fn activate(&self, user_id: Uuid, license_key: &str) -> Result<License> {
        let license = License::find_by_license_key(&self.pool, license_key)
            .await?
            .ok_or_else(|| Error::NotFound("License not found".to_string()))?;

        // Prevent license key reuse by other users
        if license.user_id != user_id {
            return Err(Error::Authorization(
                "This license key has already been activated by another user.".to_string(),
            ));
        }

        // Already active for this user
        if license.is_active {
            return Ok(license);
        }

        // Check if expired (requires renewal)
        if let Some(expires_at) = license.expires_at {
            if expires_at <= Utc::now() {
                return Err(Error::Authorization(
                    "License has expired. Please renew your subscription.".to_string(),
                ));
            }
        }

        // Calculate expiration
        let expires_at = match license.subscription_type {
            SubscriptionType::Monthly => {
                if let Some(existing) = license.expires_at {
                    if existing > Utc::now() {
                        Some(existing)
                    } else {
                        Some(Utc::now() + Duration::days(30))
                    }
                } else {
                    Some(Utc::now() + Duration::days(30))
                }
            }
            SubscriptionType::Infinite => None,
        };

        Ok(License::activate_for_user(&self.pool, user_id, license.id, expires_at).await?)
    }

    /// Validate license ownership
    pub async fn validate(&self, user_id: Uuid, license_key: &str) -> Result<License> {
        let license = License::find_by_license_key(&self.pool, license_key)
            .await?
            .ok_or_else(|| Error::NotFound("License not found".to_string()))?;

        if license.user_id != user_id {
            return Err(Error::Authorization(
                "Not authorized to validate this license".to_string(),
            ));
        }

        Ok(license)
    }
}
