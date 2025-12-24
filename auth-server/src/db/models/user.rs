//! User and UserProfile models

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub email_verified: bool,
    pub failed_login_attempts: i32,
    pub locked_until: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl User {
    pub fn is_locked(&self) -> bool {
        if let Some(locked_until) = self.locked_until {
            locked_until > Utc::now()
        } else {
            false
        }
    }

    pub async fn find_by_email(pool: &sqlx::PgPool, email: &str) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "SELECT id, email, password_hash, email_verified, failed_login_attempts, locked_until, created_at, updated_at 
             FROM users WHERE email = $1"
        )
        .bind(email)
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_id(pool: &sqlx::PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "SELECT id, email, password_hash, email_verified, failed_login_attempts, locked_until, created_at, updated_at 
             FROM users WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &sqlx::PgPool,
        email: &str,
        password_hash: &str,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "INSERT INTO users (email, password_hash) 
             VALUES ($1, $2) 
             RETURNING id, email, password_hash, email_verified, failed_login_attempts, locked_until, created_at, updated_at"
        )
        .bind(email)
        .bind(password_hash)
        .fetch_one(pool)
        .await
    }

    pub async fn increment_failed_login_attempts(
        pool: &sqlx::PgPool,
        user_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE users 
             SET failed_login_attempts = failed_login_attempts + 1,
                 locked_until = CASE 
                     WHEN failed_login_attempts + 1 >= 5 
                     THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes'
                     ELSE locked_until
                 END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1"
        )
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn reset_failed_login_attempts(
        pool: &sqlx::PgPool,
        user_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE users 
             SET failed_login_attempts = 0, 
                 locked_until = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1"
        )
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserProfile {
    pub user_id: Uuid,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl UserProfile {
    pub async fn find_by_user_id(
        pool: &sqlx::PgPool,
        user_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, UserProfile>(
            "SELECT user_id, first_name, last_name, company, created_at, updated_at 
             FROM user_profiles WHERE user_id = $1"
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        first_name: Option<String>,
        last_name: Option<String>,
        company: Option<String>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, UserProfile>(
            "INSERT INTO user_profiles (user_id, first_name, last_name, company) 
             VALUES ($1, $2, $3, $4) 
             RETURNING user_id, first_name, last_name, company, created_at, updated_at"
        )
        .bind(user_id)
        .bind(&first_name)
        .bind(&last_name)
        .bind(&company)
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        first_name: Option<String>,
        last_name: Option<String>,
        company: Option<String>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, UserProfile>(
            "UPDATE user_profiles 
             SET first_name = COALESCE($1, first_name),
                 last_name = COALESCE($2, last_name),
                 company = COALESCE($3, company),
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $4
             RETURNING user_id, first_name, last_name, company, created_at, updated_at"
        )
        .bind(&first_name)
        .bind(&last_name)
        .bind(&company)
        .bind(user_id)
        .fetch_one(pool)
        .await
    }
}

