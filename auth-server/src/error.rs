//! Error types

use actix_web::{HttpResponse, ResponseError};
use serde_json::json;
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    Database(sqlx::Error),
    Validation(String),
    Authentication(String),
    Authorization(String),
    NotFound(String),
    Internal(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Database(e) => write!(f, "Database error: {}", e),
            AppError::Validation(e) => write!(f, "Validation error: {}", e),
            AppError::Authentication(e) => write!(f, "Authentication error: {}", e),
            AppError::Authorization(e) => write!(f, "Authorization error: {}", e),
            AppError::NotFound(e) => write!(f, "Not found: {}", e),
            AppError::Internal(e) => write!(f, "Internal error: {}", e),
        }
    }
}

impl ResponseError for AppError {
    fn error_response(&self) -> HttpResponse {
        let (status, message, code) = match self {
            AppError::Database(_) => (500, "Database error", "DATABASE_ERROR"),
            AppError::Validation(msg) => (400, msg.as_str(), "VALIDATION_ERROR"),
            AppError::Authentication(msg) => (401, msg.as_str(), "AUTHENTICATION_ERROR"),
            AppError::Authorization(msg) => (403, msg.as_str(), "AUTHORIZATION_ERROR"),
            AppError::NotFound(msg) => (404, msg.as_str(), "NOT_FOUND"),
            AppError::Internal(_) => (500, "Internal server error", "INTERNAL_ERROR"),
        };

        HttpResponse::build(actix_web::http::StatusCode::from_u16(status).unwrap())
            .json(json!({
                "error": message,
                "code": status,
                "error_code": code
            }))
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::Database(err)
    }
}

impl From<validator::ValidationErrors> for AppError {
    fn from(err: validator::ValidationErrors) -> Self {
        AppError::Validation(err.to_string())
    }
}

impl From<validator::ValidationError> for AppError {
    fn from(err: validator::ValidationError) -> Self {
        AppError::Validation(err.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;

