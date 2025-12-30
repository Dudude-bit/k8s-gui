//! Database connection and pool management
//!
//! This module provides database connection pool management and model definitions.

use sqlx::{postgres::PgPoolOptions, PgPool};
use std::time::Duration;

pub mod models;

/// Create a new PostgreSQL connection pool
///
/// # Arguments
///
/// * `database_url` - PostgreSQL connection URL
///
/// # Returns
///
/// A `PgPool` instance or an error if connection fails.
pub async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(30))
        .connect(database_url)
        .await
}
