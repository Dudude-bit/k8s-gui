//! Generated gRPC client modules
//!
//! This module contains auto-generated code from `.proto` files for gRPC services.
//! The generated code includes client stubs for communicating with the auth server
//! for authentication, licensing, payment processing, and user management.
//!
//! # Submodules
//!
//! - `auth`: Authentication service client (login, register, token refresh)
//! - `license`: License management service client (activation, validation)
//! - `user`: User profile management service client
//! - `payment`: Payment processing service client

pub mod auth {
    include!("auth.rs");
}

pub mod license {
    include!("license.rs");
}

pub mod user {
    include!("user.rs");
}

pub mod payment {
    include!("payment.rs");
}
