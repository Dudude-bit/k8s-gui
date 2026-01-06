//! Terminal module for exec/shell access
//!
//! Provides interactive terminal sessions inside Kubernetes containers.

pub mod manager;
pub mod session;

pub use manager::TerminalManager;
pub use session::{TerminalConfig, TerminalSession, TerminalState};
