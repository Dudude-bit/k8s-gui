//! Terminal adapter implementations

mod auth_exec;
mod local_process;
mod pod_exec;

pub use auth_exec::AuthExecAdapter;
pub use local_process::LocalProcessAdapter;
pub use pod_exec::PodExecAdapter;
