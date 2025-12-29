//! Configuration management

use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_expiry: u64,
    pub refresh_token_expiry: u64,
    pub rate_limit_requests: u32,
    pub rate_limit_window: u64,
    pub cors_allowed_origins: Vec<String>,
    pub host: String,
    pub port: u16,
    /// Secret for verifying webhook signatures (e.g., from Stripe)
    pub webhook_secret: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        Ok(Config {
            database_url: env::var("DATABASE_URL")
                .map_err(|_| "DATABASE_URL not set")?,
            jwt_secret: env::var("JWT_SECRET")
                .map_err(|_| "JWT_SECRET not set - this is required for security")?,
            jwt_expiry: env::var("JWT_EXPIRY")
                .unwrap_or_else(|_| "3600".to_string())
                .parse()
                .unwrap_or(3600),
            refresh_token_expiry: env::var("REFRESH_TOKEN_EXPIRY")
                .unwrap_or_else(|_| "2592000".to_string())
                .parse()
                .unwrap_or(2592000),
            rate_limit_requests: env::var("RATE_LIMIT_REQUESTS")
                .unwrap_or_else(|_| "100".to_string())
                .parse()
                .unwrap_or(100),
            rate_limit_window: env::var("RATE_LIMIT_WINDOW")
                .unwrap_or_else(|_| "60".to_string())
                .parse()
                .unwrap_or(60),
            cors_allowed_origins: env::var("CORS_ALLOWED_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:1420".to_string())
                .split(',')
                .map(|s| s.trim().to_string())
                .collect(),
            host: env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
            port: env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .unwrap_or(8080),
            webhook_secret: env::var("WEBHOOK_SECRET").ok(),
        })
    }
}

