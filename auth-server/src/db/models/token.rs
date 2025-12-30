use chrono::{DateTime, Utc};
use sqlx::{PgPool, FromRow};
use uuid::Uuid;
use crate::error::Result;

/// Refresh token model - fields are read by sqlx FromRow derive
#[allow(dead_code)]
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

    pub async fn delete(pool: &PgPool, token_hash: &str) -> Result<()> {
        sqlx::query("DELETE FROM refresh_tokens WHERE token_hash = $1")
            .bind(token_hash)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Atomically delete and return a valid refresh token.
    /// This prevents race conditions where the same token could be used twice.
    /// Returns the user_id if the token was valid and deleted, None otherwise.
    pub async fn consume(pool: &PgPool, token_hash: &str) -> Result<Option<Uuid>> {
        let result = sqlx::query_scalar::<_, Uuid>(
            "DELETE FROM refresh_tokens 
             WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP
             RETURNING user_id"
        )
        .bind(token_hash)
        .fetch_optional(pool)
        .await?;
        Ok(result)
    }

    /// Delete all refresh tokens for a specific user (used during login to prevent accumulation)
    pub async fn delete_all_for_user(pool: &PgPool, user_id: Uuid) -> Result<u64> {
        let result = sqlx::query("DELETE FROM refresh_tokens WHERE user_id = $1")
            .bind(user_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Delete all expired refresh tokens. Returns the number of deleted tokens.
    pub async fn cleanup_expired(pool: &PgPool) -> Result<u64> {
        let result = sqlx::query("DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP")
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
