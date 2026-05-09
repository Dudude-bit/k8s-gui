//! Debug commands for kubectl debug functionality.
//!
//! Three debug modes:
//! - **Ephemeral Container**: Add a debug container to an existing pod
//! - **Copy Pod**: Create a copy of a pod with a debug container
//! - **Node Debug**: Create a privileged pod for node-level debugging
//!
//! Re-exports the shared types and Tauri command handlers; the
//! implementations live in `create` (the three creation commands),
//! `manage` (lifecycle commands), and `status` (pure pod-status
//! inspection helpers).

mod create;
mod manage;
mod status;
mod types;

pub use create::{debug_node, debug_pod_copy, debug_pod_ephemeral};
pub use manage::{
    cancel_debug_operation, delete_debug_pod, extend_debug_timeout, get_debug_status,
    list_debug_pods,
};
pub use types::{DebugConfig, DebugOperation, DebugOperationType, DebugResult, DebugStatus};
