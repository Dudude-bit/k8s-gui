//! License service layer

use chrono::{Duration, Utc};
use sea_orm::entity::prelude::DateTimeWithTimeZone;
use sea_orm::DatabaseConnection;
use uuid::Uuid;

use crate::db::entities::{License, SubscriptionType};
use crate::db::repositories::licenses;
use crate::error::{Error, Result};

pub struct LicenseService {
    pool: DatabaseConnection,
}

impl LicenseService {
    pub fn new(pool: DatabaseConnection) -> Self {
        Self { pool }
    }

    /// Get license status for a user
    pub async fn get_status(&self, user_id: Uuid) -> Result<Option<License>> {
        let license = licenses::find_by_user_id(&self.pool, user_id).await?;

        Ok(license)
    }

    /// Activate license for user
    pub async fn activate(&self, user_id: Uuid, license_key: &str) -> Result<License> {
        let license = licenses::find_by_license_key(&self.pool, license_key)
            .await?
            .ok_or_else(|| Error::NotFound("License not found".to_string()))?;

        let now: DateTimeWithTimeZone = Utc::now().into();

        // Prevent license key reuse by other users
        if license.user_id != user_id {
            return Err(Error::Authorization(
                "This license key has already been activated by another user.".to_string(),
            ));
        }

        // Check if expired (requires renewal)
        if let Some(expires_at) = license.expires_at {
            if expires_at <= now {
                return Err(Error::Authorization(
                    "License has expired. Please renew your subscription.".to_string(),
                ));
            }
        }

        // Already active for this user
        if license.is_active {
            return Ok(license);
        }

        // Calculate expiration
        let expires_at = match license.subscription_type {
            SubscriptionType::Monthly => {
                if let Some(existing) = license.expires_at {
                    if existing > now {
                        Some(existing)
                    } else {
                        Some(now + Duration::days(30))
                    }
                } else {
                    Some(now + Duration::days(30))
                }
            }
            SubscriptionType::Lifetime => None,
        };

        Ok(licenses::activate_for_user(&self.pool, user_id, license.id, expires_at).await?)
    }

    /// Validate license ownership
    pub async fn validate(&self, user_id: Uuid, license_key: &str) -> Result<License> {
        let license = licenses::find_by_license_key(&self.pool, license_key)
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
