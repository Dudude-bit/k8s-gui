use chrono::{DateTime, Utc};
use sqlx::{PgPool, FromRow};
use uuid::Uuid;
use crate::error::Result;

#[derive(Debug, FromRow)]
pub struct RefreshToken {
    pub user_id: Uuid,
    pub token_hash: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: Option<DateTime<Utc>>,
}

impl RefreshToken {
    pub async fn create(pool: &PgPool, user_id: Uuid, token_hash: String, expires_at: DateTime<Utc>) -> Result<()> {
        sqlx::query(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) 
             VALUES ($1, $2, $3)"
        )
        .bind(user_id)
        .bind(token_hash)
        .bind(expires_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn exists(pool: &PgPool, token_hash: &str) -> Result<bool> {
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM refresh_tokens WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP)"
        )
        .bind(token_hash)
        .fetch_one(pool)
        .await?;
        Ok(exists)
    }

    pub async fn delete(pool: &PgPool, token_hash: &str) -> Result<()> {
        sqlx::query("DELETE FROM refresh_tokens WHERE token_hash = $1")
            .bind(token_hash)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Delete all expired refresh tokens. Returns the number of deleted tokens.
    pub async fn cleanup_expired(pool: &PgPool) -> Result<u64> {
        let result = sqlx::query("DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP")
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}

#[derive(Debug, FromRow)]
pub struct PasswordResetToken {
    pub user_id: Uuid,
    pub token_hash: String,
    pub expires_at: DateTime<Utc>,
    pub used: bool,
    pub created_at: Option<DateTime<Utc>>,
}

impl PasswordResetToken {
    pub async fn create(pool: &PgPool, user_id: Uuid, token_hash: String, expires_at: DateTime<Utc>) -> Result<()> {
        sqlx::query(
            "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) 
             VALUES ($1, $2, $3)
             ON CONFLICT (token_hash) DO UPDATE SET expires_at = $3, used = FALSE"
        )
        .bind(user_id)
        .bind(token_hash)
        .bind(expires_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn find_valid(pool: &PgPool, token_hash: &str) -> Result<Option<Self>> {
        let token = sqlx::query_as::<_, Self>(
            "SELECT user_id, token_hash, expires_at, used, created_at 
             FROM password_reset_tokens 
             WHERE token_hash = $1 AND used = FALSE AND expires_at > CURRENT_TIMESTAMP"
        )
        .bind(token_hash)
        .fetch_optional(pool)
        .await?;
        Ok(token)
    }

    pub async fn mark_used(pool: &PgPool, token_hash: &str) -> Result<()> {
        sqlx::query(
            "UPDATE password_reset_tokens SET used = TRUE WHERE token_hash = $1"
        )
        .bind(token_hash)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Delete all expired or used password reset tokens. Returns the number of deleted tokens.
    pub async fn cleanup_expired(pool: &PgPool) -> Result<u64> {
        let result = sqlx::query(
            "DELETE FROM password_reset_tokens WHERE expires_at < CURRENT_TIMESTAMP OR used = TRUE"
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}
