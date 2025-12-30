use crate::db::models::{User, UserProfile};
use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileResponse {
    pub user_id: Uuid,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company: Option<String>,
    pub email_verified: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileRequest {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company: Option<String>,
}

pub struct UserService {
    pool: PgPool,
}

impl UserService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_profile(&self, user_id: Uuid) -> Result<ProfileResponse> {
        let user = User::find_by_id(&self.pool, user_id)
            .await?
            .ok_or_else(|| Error::NotFound("User not found".to_string()))?;

        let profile = UserProfile::find_by_user_id(&self.pool, user_id).await?;

        Ok(ProfileResponse {
            user_id: user.id,
            email: user.email,
            first_name: profile.as_ref().and_then(|p| p.first_name.clone()),
            last_name: profile.as_ref().and_then(|p| p.last_name.clone()),
            company: profile.as_ref().and_then(|p| p.company.clone()),
            email_verified: user.email_verified,
        })
    }

    pub async fn update_profile(
        &self,
        user_id: Uuid,
        req: UpdateProfileRequest,
    ) -> Result<ProfileResponse> {
        // Check if profile exists, create if not
        let profile = if UserProfile::find_by_user_id(&self.pool, user_id)
            .await?
            .is_some()
        {
            UserProfile::update(
                &self.pool,
                user_id,
                req.first_name.clone(),
                req.last_name.clone(),
                req.company.clone(),
            )
            .await?
        } else {
            UserProfile::create(
                &self.pool,
                user_id,
                req.first_name.clone(),
                req.last_name.clone(),
                req.company.clone(),
            )
            .await?
        };

        let user = User::find_by_id(&self.pool, user_id)
            .await?
            .ok_or_else(|| Error::NotFound("User not found".to_string()))?;

        Ok(ProfileResponse {
            user_id: user.id,
            email: user.email,
            first_name: profile.first_name,
            last_name: profile.last_name,
            company: profile.company,
            email_verified: user.email_verified,
        })
    }
}
