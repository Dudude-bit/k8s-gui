//! Tauri commands module
//!
//! Exposes Rust functionality to the frontend via Tauri commands.

pub mod filters;
pub mod helpers;

pub mod auth;
pub mod cluster;
pub mod config_resources;
pub mod deployments;
pub mod events;
pub mod license;
pub mod logs;
pub mod metrics;
pub mod namespace;
pub mod network;
pub mod nodes;
pub mod plugins;
pub mod pods;
pub mod port_forward;
pub mod registry;
pub mod resources;
pub mod services;
pub mod settings;
pub mod stats;
pub mod storage;
pub mod terminal;
pub mod validation;
pub mod workloads;

// Re-export all commands for easy registration
pub use auth::*;
pub use cluster::*;
pub use config_resources::*;
pub use deployments::*;
pub use events::*;
pub use license::*;
pub use logs::*;
pub use metrics::*;
pub use namespace::*;
pub use network::*;
pub use nodes::*;
pub use plugins::*;
pub use pods::*;
pub use port_forward::*;
pub use registry::*;
pub use resources::*;
pub use services::*;
pub use settings::*;
pub use stats::*;
pub use storage::*;
pub use terminal::*;
pub use validation::*;
pub use workloads::*;
