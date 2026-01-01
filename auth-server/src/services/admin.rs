//! Admin service
//!
//! Provides administrative operations such as user registration and license issuance.

use crate::db::entities::SubscriptionType;
use crate::db::repositories::{licenses, user_profiles, users};
use crate::error::{Error, Result};
use crate::utils::password::hash_password;
use chrono::{Duration, Utc};
use k8s_gui_common::validation::{validate_email, validate_password};
use sea_orm::entity::prelude::DateTimeWithTimeZone;
use sea_orm::DatabaseConnection;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct CreateUserRequest {
    pub email: String,
    pub password: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CreateUserResponse {
    pub user_id: Uuid,
    pub email: String,
}

#[derive(Debug, Clone)]
pub struct IssueLicenseRequest {
    pub user_id: Uuid,
    pub subscription_type: SubscriptionType,
    pub months: i32,
}

#[derive(Debug, Clone)]
pub struct IssueLicenseResponse {
    pub license_id: Uuid,
    pub user_id: Uuid,
    pub license_key: String,
    pub subscription_type: SubscriptionType,
    pub expires_at: Option<DateTimeWithTimeZone>,
    pub is_active: bool,
}

pub struct AdminService {
    pool: DatabaseConnection,
}

impl AdminService {
    pub fn new(pool: DatabaseConnection) -> Self {
        Self { pool }
    }

    pub async fn create_user(&self, req: CreateUserRequest) -> Result<CreateUserResponse> {
        validate_email(&req.email).map_err(Error::Validation)?;
        validate_password(&req.password).map_err(Error::Validation)?;

        if users::find_by_email(&self.pool, &req.email)
            .await?
            .is_some()
        {
            return Err(Error::Validation(
                "User with this email already exists".to_string(),
            ));
        }

        let password_hash = hash_password(&req.password)
            .map_err(|e| Error::Internal(format!("Failed to hash password: {e}")))?;

        let user = users::create(&self.pool, &req.email, &password_hash).await?;

        if req.first_name.is_some() || req.last_name.is_some() || req.company.is_some() {
            user_profiles::create(
                &self.pool,
                user.id,
                req.first_name.clone(),
                req.last_name.clone(),
                req.company.clone(),
            )
            .await?;
        }

        Ok(CreateUserResponse {
            user_id: user.id,
            email: user.email,
        })
    }

    pub async fn issue_license(&self, req: IssueLicenseRequest) -> Result<IssueLicenseResponse> {
        let user = users::find_by_id(&self.pool, req.user_id).await?;
        if user.is_none() {
            return Err(Error::NotFound("User not found".to_string()));
        }

        if matches!(req.subscription_type, SubscriptionType::Monthly) && req.months < 1 {
            return Err(Error::Validation(
                "Months must be at least 1 for monthly licenses".to_string(),
            ));
        }

        let expires_at = match req.subscription_type {
            SubscriptionType::Monthly => {
                let now: DateTimeWithTimeZone = Utc::now().into();
                Some(now + Duration::days(30 * req.months as i64))
            }
            SubscriptionType::Infinite => None,
        };

        let license_key = Uuid::new_v4().to_string();
        let license = licenses::create(
            &self.pool,
            req.user_id,
            license_key,
            req.subscription_type,
            expires_at,
        )
        .await?;

        Ok(IssueLicenseResponse {
            license_id: license.id,
            user_id: license.user_id,
            license_key: license.license_key,
            subscription_type: license.subscription_type,
            expires_at: license.expires_at,
            is_active: license.is_active,
        })
    }
}
