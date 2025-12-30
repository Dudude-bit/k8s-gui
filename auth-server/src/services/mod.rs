//! Business logic services
//!
//! This module contains the core business logic services that handle
//! authentication, user management, licensing, and payment processing.

pub mod auth;
pub mod license;
pub mod payment;
pub mod user;

// Re-export all services for easy access
// These re-exports are intentionally unused in this module but provide
// a convenient public API for external consumers
#[allow(unused_imports)]
pub use auth::*;
#[allow(unused_imports)]
pub use license::*;
#[allow(unused_imports)]
pub use payment::*;
#[allow(unused_imports)]
pub use user::*;
