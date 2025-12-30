//! Common utilities for K8s GUI projects
//!
//! This crate provides shared functionality used across multiple
//! K8s GUI projects, including:
//!
//! - **Tracing**: Unified logging and tracing initialization
//! - **Validation**: Input validation for emails, passwords, and license keys
//! - **Error handling**: Common error trait for consistent error handling
//! - **DTOs**: Shared data transfer objects for API consistency
//! - **DateTime**: Date and time formatting utilities

pub mod datetime;
pub mod dto;
pub mod error;
pub mod tracing;
pub mod validation;

// Re-export tracing utilities
pub use tracing::init_tracing;

// Re-export validation utilities
pub use validation::{
    validate_email, validate_license_key, validate_pagination, validate_password,
    PasswordRequirements, ValidationResult,
};

// Re-export error utilities
pub use error::ErrorExt;

// Re-export DTOs
pub use dto::{
    ActivateLicenseRequest, LoginRequest, MessageResponse, RefreshRequest, RegisterRequest,
};

// Re-export datetime utilities
pub use datetime::{format_age, format_duration, format_rfc3339, parse_rfc3339};
