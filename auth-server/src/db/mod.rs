//! Database connection and pool management
//!
//! This module provides database connection pool management, entity definitions, and repositories.

use sea_orm::{Database, DatabaseConnection, DbErr};

pub mod entities;
pub mod repositories;

/// Create a new PostgreSQL connection pool
///
/// # Arguments
///
/// * `database_url` - PostgreSQL connection URL
///
/// # Returns
///
/// A `DatabaseConnection` instance or an error if connection fails.
pub async fn create_pool(database_url: &str) -> Result<DatabaseConnection, DbErr> {
    Database::connect(database_url).await
}
