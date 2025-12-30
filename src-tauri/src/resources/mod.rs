//! Resource management module
//!
//! Provides abstractions for working with Kubernetes resources.

mod serialization;
mod types;
mod watcher;

pub use serialization::*;
pub use types::*;
pub use watcher::ResourceWatcher;
