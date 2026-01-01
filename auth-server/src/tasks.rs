//! Background tasks for cleanup and maintenance

use sea_orm::DatabaseConnection;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::interval;

use crate::db::repositories::refresh_tokens;
use crate::utils::rate_limit::RateLimiters;

/// Interval for token cleanup task (1 hour)
const CLEANUP_INTERVAL_SECS: u64 = 3600;

/// Interval for rate limiter cleanup (5 minutes)
const RATE_LIMIT_CLEANUP_INTERVAL_SECS: u64 = 300;

/// Spawn all background tasks
pub fn spawn_background_tasks(pool: Arc<DatabaseConnection>, rate_limiters: Arc<RateLimiters>) {
    let cleanup_pool = pool.clone();
    tokio::spawn(async move {
        token_cleanup_task(cleanup_pool).await;
    });

    tokio::spawn(async move {
        rate_limit_cleanup_task(rate_limiters).await;
    });
}

/// Periodically clean up expired tokens
async fn token_cleanup_task(pool: Arc<DatabaseConnection>) {
    let mut interval = interval(Duration::from_secs(CLEANUP_INTERVAL_SECS));

    // Skip the first tick (immediate)
    interval.tick().await;

    loop {
        interval.tick().await;

        tracing::info!("Running token cleanup task...");

        match refresh_tokens::cleanup_expired(&pool).await {
            Ok(count) => {
                if count > 0 {
                    tracing::info!("Cleaned up {} expired refresh tokens", count);
                }
            }
            Err(e) => {
                tracing::error!("Failed to cleanup refresh tokens: {}", e);
            }
        }
    }
}

/// Periodically clean up expired rate limit entries
async fn rate_limit_cleanup_task(rate_limiters: Arc<RateLimiters>) {
    let mut interval = interval(Duration::from_secs(RATE_LIMIT_CLEANUP_INTERVAL_SECS));

    // Skip the first tick (immediate)
    interval.tick().await;

    loop {
        interval.tick().await;

        rate_limiters.cleanup_all();
        tracing::debug!("Rate limiter cleanup completed");
    }
}
