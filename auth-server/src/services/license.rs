//! License service layer

use sqlx::PgPool;
use uuid::Uuid;
use chrono::{Duration, Utc};

use crate::error::{AppError, Result};
use crate::db::models::{License, AuditLog};
use crate::db::models::license::SubscriptionType;

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
            AuditLog::log_license_check(&self.pool, user_id, is_valid, ip).await.ok();
        }
        
        Ok(license)
    }

    /// Check if user has valid license
    pub async fn is_valid(&self, user_id: Uuid) -> Result<bool> {
        let license = License::find_by_user_id(&self.pool, user_id).await?;
        Ok(license.map(|l| l.is_valid()).unwrap_or(false))
    }

    /// Find license by key
    pub async fn find_by_key(&self, license_key: &str) -> Result<Option<License>> {
        Ok(License::find_by_license_key(&self.pool, license_key).await?)
    }

    /// Activate license for user
    pub async fn activate(
        &self,
        user_id: Uuid,
        license_key: &str,
    ) -> Result<License> {
        let license = License::find_by_license_key(&self.pool, license_key).await?
            .ok_or_else(|| AppError::NotFound("License not found".to_string()))?;

        // Prevent license key reuse by other users
        if license.user_id != user_id {
            return Err(AppError::Authorization(
                "This license key has already been activated by another user.".to_string()
            ));
        }

        // Already active for this user
        if license.is_active {
            return Ok(license);
        }

        // Check if expired (requires renewal)
        if let Some(expires_at) = license.expires_at {
            if expires_at <= Utc::now() {
                return Err(AppError::Authorization(
                    "License has expired. Please renew your subscription.".to_string()
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
            },
            SubscriptionType::Infinite => None,
        };

        Ok(License::activate_for_user(&self.pool, user_id, license.id, expires_at).await?)
    }

    /// Validate license ownership
    pub async fn validate(&self, user_id: Uuid, license_key: &str) -> Result<License> {
        let license = License::find_by_license_key(&self.pool, license_key).await?
            .ok_or_else(|| AppError::NotFound("License not found".to_string()))?;

        if license.user_id != user_id {
            return Err(AppError::Authorization(
                "Not authorized to validate this license".to_string()
            ));
        }

        Ok(license)
    }

    /// Create a new license
    pub async fn create(
        &self,
        user_id: Uuid,
        subscription_type: SubscriptionType,
    ) -> Result<License> {
        let license_key = Uuid::new_v4().to_string();
        let expires_at = match subscription_type {
            SubscriptionType::Monthly => Some(Utc::now() + Duration::days(30)),
            SubscriptionType::Infinite => None,
        };

        Ok(License::create(&self.pool, user_id, license_key, subscription_type, expires_at).await?)
    }

    /// Extend license by months
    pub async fn extend_monthly(&self, license_id: Uuid, user_id: Uuid, months: i32) -> Result<()> {
        License::extend_monthly(&self.pool, license_id, user_id, months).await
            .map_err(|e| AppError::Internal(format!("Failed to extend license: {}", e)))?;
        Ok(())
    }
}
