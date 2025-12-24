//! Database connection and pool management

use sqlx::{postgres::PgPoolOptions, PgPool};
use std::time::Duration;

pub mod models;

pub async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(30))
        .connect(database_url)
        .await
}

