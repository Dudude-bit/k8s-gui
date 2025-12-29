//! Background tasks for cleanup and maintenance

use sqlx::PgPool;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::interval;

use crate::db::models::token::{RefreshToken, PasswordResetToken};

/// Interval for token cleanup task (1 hour)
const CLEANUP_INTERVAL_SECS: u64 = 3600;

/// Spawn all background tasks
pub fn spawn_background_tasks(pool: Arc<PgPool>) {
    let cleanup_pool = pool.clone();
    tokio::spawn(async move {
        token_cleanup_task(cleanup_pool).await;
    });
}

/// Periodically clean up expired tokens
async fn token_cleanup_task(pool: Arc<PgPool>) {
    let mut interval = interval(Duration::from_secs(CLEANUP_INTERVAL_SECS));
    
    // Skip the first tick (immediate)
    interval.tick().await;
    
    loop {
        interval.tick().await;
        
        log::info!("Running token cleanup task...");
        
        match RefreshToken::cleanup_expired(&pool).await {
            Ok(count) => {
                if count > 0 {
                    log::info!("Cleaned up {} expired refresh tokens", count);
                }
            }
            Err(e) => {
                log::error!("Failed to cleanup refresh tokens: {}", e);
            }
        }
        
        match PasswordResetToken::cleanup_expired(&pool).await {
            Ok(count) => {
                if count > 0 {
                    log::info!("Cleaned up {} expired/used password reset tokens", count);
                }
            }
            Err(e) => {
                log::error!("Failed to cleanup password reset tokens: {}", e);
            }
        }
    }
}
