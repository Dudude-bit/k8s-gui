//! Generated gRPC proto modules
//!
//! This module contains auto-generated code from .proto files for gRPC services.
//! The generated code includes client and server stubs for authentication, licensing,
//! payment processing, and user management.

pub mod auth {
    include!("auth.rs");
}

pub mod license {
    include!("license.rs");
}

pub mod payment {
    include!("payment.rs");
}

pub mod user {
    include!("user.rs");
}
