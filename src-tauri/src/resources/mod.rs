//! Resource management module
//!
//! Provides abstractions for working with Kubernetes resources.

mod network;
mod resource_types;
mod serialization;
mod storage;
mod types;
mod watcher;
mod workloads;

pub use network::*;
pub use resource_types::ResourceType;
pub use serialization::*;
pub use storage::*;
pub use types::*;
pub use watcher::ResourceWatcher;
pub use workloads::*;
