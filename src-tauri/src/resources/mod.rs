//! Resource management module
//! 
//! Provides abstractions for working with Kubernetes resources.

mod types;
mod watcher;
mod serialization;

pub use types::*;
pub use watcher::ResourceWatcher;
pub use serialization::*;
