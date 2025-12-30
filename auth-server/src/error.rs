//! Error handling for authentication and licensing server
//!
//! This module provides a comprehensive error type that covers all possible
//! error scenarios in the application, with proper conversion from library errors.

use serde::Serialize;
use thiserror::Error;
use tonic::Status;

/// Application-wide result type
pub type Result<T> = std::result::Result<T, Error>;

/// Main error type for the authentication and licensing server
#[derive(Error, Debug)]
pub enum Error {
    /// Database errors
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    /// Validation errors
    #[error("Validation error: {0}")]
    Validation(String),

    /// Authentication errors
    #[error("Authentication error: {0}")]
    Authentication(String),

    /// Authorization errors
    #[error("Authorization error: {0}")]
    Authorization(String),

    /// Resource not found
    #[error("Not found: {0}")]
    NotFound(String),

    /// Internal errors
    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<validator::ValidationErrors> for Error {
    fn from(err: validator::ValidationErrors) -> Self {
        Error::Validation(err.to_string())
    }
}

impl From<validator::ValidationError> for Error {
    fn from(err: validator::ValidationError) -> Self {
        Error::Validation(err.to_string())
    }
}

impl From<Error> for Status {
    fn from(err: Error) -> Self {
        match err {
            Error::Database(_) => Status::internal("Database error"),
            Error::Validation(msg) => Status::invalid_argument(msg),
            Error::Authentication(msg) => Status::unauthenticated(msg),
            Error::Authorization(msg) => Status::permission_denied(msg),
            Error::NotFound(msg) => Status::not_found(msg),
            Error::Internal(msg) => Status::internal(msg),
        }
    }
}

impl Error {
    /// Get error code for frontend handling
    ///
    /// # Returns
    ///
    /// A static string representing the error code.
    pub fn error_code(&self) -> &'static str {
        match self {
            Error::Database(_) => "DATABASE_ERROR",
            Error::Validation(_) => "VALIDATION_ERROR",
            Error::Authentication(_) => "AUTHENTICATION_ERROR",
            Error::Authorization(_) => "AUTHORIZATION_ERROR",
            Error::NotFound(_) => "NOT_FOUND",
            Error::Internal(_) => "INTERNAL_ERROR",
        }
    }

    /// Get additional details for debugging
    ///
    /// # Returns
    ///
    /// Returns `Some(String)` with detailed error information if available,
    /// or `None` if no additional details are available.
    pub fn details(&self) -> Option<String> {
        match self {
            Error::Database(e) => Some(format!("{e:?}")),
            Error::Validation(msg) => Some(msg.clone()),
            Error::Authentication(msg) => Some(msg.clone()),
            Error::Authorization(msg) => Some(msg.clone()),
            Error::NotFound(msg) => Some(msg.clone()),
            Error::Internal(msg) => Some(msg.clone()),
        }
    }

    /// Check if error is retryable
    ///
    /// # Returns
    ///
    /// Returns `true` if the operation that caused this error can be safely retried,
    /// `false` otherwise.
    pub fn is_retryable(&self) -> bool {
        matches!(self, Error::Database(_) | Error::Internal(_))
    }

    /// Create a not found error
    ///
    /// # Arguments
    ///
    /// * `resource` - Resource identifier that was not found
    ///
    /// # Returns
    ///
    /// A new `Error::NotFound` variant.
    pub fn not_found(resource: impl Into<String>) -> Self {
        Error::NotFound(resource.into())
    }
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        // Serialize as a string, not an object, for consistency with src-tauri
        serializer.serialize_str(&self.to_string())
    }
}
