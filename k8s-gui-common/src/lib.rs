//! Common utilities for K8s GUI projects
//!
//! This crate provides shared functionality used across multiple
//! K8s GUI projects, including tracing initialization, validation, and other utilities.

pub mod tracing;
pub mod validation;

pub use tracing::init_tracing;
pub use validation::{
    validate_email, validate_license_key, validate_pagination, validate_password,
    PasswordRequirements, ValidationResult,
};
