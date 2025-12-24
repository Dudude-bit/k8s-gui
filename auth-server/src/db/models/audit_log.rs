//! Audit log model

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AuditLog {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub event_type: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub details: Option<Value>,
    pub created_at: DateTime<Utc>,
}

impl AuditLog {
    pub async fn create(
        pool: &sqlx::PgPool,
        user_id: Option<Uuid>,
        event_type: &str,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
        details: Option<Value>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, AuditLog>(
            "INSERT INTO audit_logs (user_id, event_type, ip_address, user_agent, details) 
             VALUES ($1, $2, $3::INET, $4, $5) 
             RETURNING id, user_id, event_type, ip_address, user_agent, details, created_at"
        )
        .bind(&user_id)
        .bind(event_type)
        .bind(ip_address)
        .bind(user_agent)
        .bind(&details)
        .fetch_one(pool)
        .await
    }

    pub async fn log_login_attempt(
        pool: &sqlx::PgPool,
        user_id: Option<Uuid>,
        email: &str,
        success: bool,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        let details = serde_json::json!({
            "email": email,
            "success": success
        });
        Self::create(
            pool,
            user_id,
            "login_attempt",
            ip_address,
            user_agent,
            Some(details),
        )
        .await?;
        Ok(())
    }

    pub async fn log_license_check(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        license_valid: bool,
        ip_address: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        let details = serde_json::json!({
            "license_valid": license_valid
        });
        Self::create(
            pool,
            Some(user_id),
            "license_check",
            ip_address,
            None,
            Some(details),
        )
        .await?;
        Ok(())
    }

    pub async fn log_suspicious_activity(
        pool: &sqlx::PgPool,
        user_id: Option<Uuid>,
        activity_type: &str,
        details: Value,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        let mut log_details = details;
        if let Some(obj) = log_details.as_object_mut() {
            obj.insert("activity_type".to_string(), serde_json::Value::String(activity_type.to_string()));
        }
        Self::create(
            pool,
            user_id,
            "suspicious_activity",
            ip_address,
            user_agent,
            Some(log_details),
        )
        .await?;
        Ok(())
    }

    pub async fn log_password_reset(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        Self::create(
            pool,
            Some(user_id),
            "password_reset",
            ip_address,
            user_agent,
            None,
        )
        .await?;
        Ok(())
    }
}

