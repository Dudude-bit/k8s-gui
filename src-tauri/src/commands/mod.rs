//! Tauri commands module
//! 
//! Exposes Rust functionality to the frontend via Tauri commands.

pub mod cluster;
pub mod namespace;
pub mod resources;
pub mod pods;
pub mod deployments;
pub mod services;
pub mod config_resources;
pub mod nodes;
pub mod events;
pub mod logs;
pub mod terminal;
pub mod plugins;
pub mod settings;
pub mod auth;

// Re-export all commands for easy registration
pub use cluster::*;
pub use namespace::*;
pub use resources::*;
pub use pods::*;
pub use deployments::*;
pub use services::*;
pub use config_resources::*;
pub use nodes::*;
pub use events::*;
pub use logs::*;
pub use terminal::*;
pub use plugins::*;
pub use settings::*;
pub use auth::*;
