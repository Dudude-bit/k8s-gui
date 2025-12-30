//! Error types

use std::fmt;
use tonic::Status;

#[derive(Debug)]
pub enum AppError {
    Database(sqlx::Error),
    Validation(String),
    Authentication(String),
    Authorization(String),
    NotFound(String),
    Internal(String),
}

pub type Result<T> = std::result::Result<T, AppError>;

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

impl std::error::Error for AppError {}

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

impl From<AppError> for Status {
    fn from(err: AppError) -> Self {
        match err {
            AppError::Database(_) => Status::internal("Database error"),
            AppError::Validation(msg) => Status::invalid_argument(msg),
            AppError::Authentication(msg) => Status::unauthenticated(msg),
            AppError::Authorization(msg) => Status::permission_denied(msg),
            AppError::NotFound(msg) => Status::not_found(msg),
            AppError::Internal(msg) => Status::internal(msg),
        }
    }
}
