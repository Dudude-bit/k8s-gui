//! Configuration management
//!
//! This module provides configuration loading from environment variables
//! with sensible defaults for development.

use crate::error::{Error, Result};
use std::env;

/// Default JWT access token expiry time in seconds (1 hour)
const DEFAULT_JWT_EXPIRY: u64 = 3600;

/// Default refresh token expiry time in seconds (60 days)
const DEFAULT_REFRESH_TOKEN_EXPIRY: u64 = 5184000;

/// Default server host address
const DEFAULT_HOST: &str = "127.0.0.1";

/// Default server port
const DEFAULT_PORT: u16 = 50051;

/// Default REST server port
const DEFAULT_REST_PORT: u16 = 8080;

/// Application configuration
#[derive(Debug, Clone)]
pub struct Config {
    /// PostgreSQL database connection URL
    pub database_url: String,
    /// Secret key for JWT token signing
    pub jwt_secret: String,
    /// JWT access token expiry time in seconds (default: 3600)
    pub jwt_expiry: u64,
    /// Refresh token expiry time in seconds (default: 5184000 = 60 days)
    pub refresh_token_expiry: u64,
    /// Server host address (default: 127.0.0.1)
    pub host: String,
    /// Server port (default: 50051)
    pub port: u16,
    /// REST server host address (default: 127.0.0.1)
    pub rest_host: String,
    /// REST server port (default: 8080)
    pub rest_port: u16,
    /// Admin API key for REST endpoints
    pub admin_api_key: String,
    /// Secret for verifying webhook signatures
    pub webhook_secret: String,
}

impl Config {
    /// Load configuration from environment variables
    ///
    /// This is the main entry point for loading configuration.
    /// It reads configuration from environment variables with sensible defaults
    /// for optional values. Required variables must be set or the function will return an error.
    ///
    /// # Required Environment Variables
    ///
    /// - `DATABASE_URL`: PostgreSQL database connection URL
    /// - `JWT_SECRET`: Secret key for JWT token signing
    /// - `ADMIN_API_KEY`: Admin API key for REST endpoints
    /// - `WEBHOOK_SECRET`: Secret for verifying webhook signatures
    ///
    /// # Optional Environment Variables (with defaults)
    ///
    /// - `JWT_EXPIRY`: JWT access token expiry in seconds (default: 3600)
    /// - `REFRESH_TOKEN_EXPIRY`: Refresh token expiry in seconds (default: 2592000)
    /// - `HOST`: Server host address (default: 127.0.0.1)
    /// - `PORT`: Server port (default: 50051)
    /// - `REST_HOST`: REST server host address (default: 127.0.0.1)
    /// - `REST_PORT`: REST server port (default: 8080)
    ///
    /// # Errors
    ///
    /// Returns an error if required environment variables are not set.
    pub fn load() -> Result<Self> {
        Self::from_env()
    }

    /// Load configuration from environment variables
    ///
    /// This method reads configuration from environment variables with sensible defaults
    /// for optional values. Required variables must be set or the function will return an error.
    ///
    /// # Errors
    ///
    /// Returns an error if required environment variables are not set.
    pub fn from_env() -> Result<Self> {
        Ok(Config {
            database_url: env::var("DATABASE_URL")
                .map_err(|_| Error::Internal("DATABASE_URL not set".to_string()))?,
            jwt_secret: env::var("JWT_SECRET")
                .map_err(|_| Error::Internal("JWT_SECRET not set".to_string()))?,
            jwt_expiry: env::var("JWT_EXPIRY")
                .unwrap_or_else(|_| DEFAULT_JWT_EXPIRY.to_string())
                .parse()
                .unwrap_or(DEFAULT_JWT_EXPIRY),
            refresh_token_expiry: env::var("REFRESH_TOKEN_EXPIRY")
                .unwrap_or_else(|_| DEFAULT_REFRESH_TOKEN_EXPIRY.to_string())
                .parse()
                .unwrap_or(DEFAULT_REFRESH_TOKEN_EXPIRY),
            host: env::var("HOST").unwrap_or_else(|_| DEFAULT_HOST.to_string()),
            port: env::var("PORT")
                .unwrap_or_else(|_| DEFAULT_PORT.to_string())
                .parse()
                .unwrap_or(DEFAULT_PORT),
            rest_host: env::var("REST_HOST").unwrap_or_else(|_| DEFAULT_HOST.to_string()),
            rest_port: env::var("REST_PORT")
                .unwrap_or_else(|_| DEFAULT_REST_PORT.to_string())
                .parse()
                .unwrap_or(DEFAULT_REST_PORT),
            admin_api_key: env::var("ADMIN_API_KEY")
                .map_err(|_| Error::Internal("ADMIN_API_KEY not set".to_string()))?,
            webhook_secret: {
                let secret = env::var("WEBHOOK_SECRET")
                    .map_err(|_| Error::Internal("WEBHOOK_SECRET not set".to_string()))?;
                if secret.trim().is_empty() {
                    return Err(Error::Internal("WEBHOOK_SECRET is empty".to_string()));
                }
                secret
            },
        })
    }
}
