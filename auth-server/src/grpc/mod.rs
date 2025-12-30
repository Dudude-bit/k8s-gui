//! gRPC service implementations
//!
//! This module contains gRPC service implementations that wrap business logic services
//! and handle gRPC-specific concerns like request/response conversion and authentication.

pub mod auth;
pub mod license;
pub mod payment;
pub mod user;

// Re-export all gRPC services for easy access.
// These re-exports provide a convenient public API for service registration in main.rs.
pub use auth::AuthGrpcService;
pub use license::LicenseGrpcService;
pub use payment::PaymentGrpcService;
pub use user::UserGrpcService;
