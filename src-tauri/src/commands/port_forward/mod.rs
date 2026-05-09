//! Pod port-forward commands.
//!
//! - `types`:   shared DTOs + helpers
//! - `session`: live port-forward session lifecycle (bind / accept /
//!              copy bytes via `kube::Api::portforward`) + the
//!              `PortForwardCleanup` Drop guard
//! - `config`:  saved-config CRUD over `AppConfig.port_forward`

mod config;
mod session;
mod types;

pub use config::{
    create_port_forward_config, delete_port_forward_config, list_port_forward_configs,
    update_port_forward_config,
};
pub use session::{list_port_forwards, port_forward_pod, stop_port_forward};
pub use types::{
    PortForwardConfigInfo, PortForwardConfigPayload, PortForwardRequest, PortForwardSessionInfo,
};
