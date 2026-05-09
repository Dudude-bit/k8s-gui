//! Container/image registry commands — credentials + image search.
//!
//! - `types`:  frontend DTOs + Docker `config.json` decoding shapes
//! - `auth`:   credential storage on AppConfig + import_docker_config
//! - `search`: per-provider image search dispatcher

mod auth;
mod search;
mod types;

pub use auth::{
    delete_registry_credentials, get_registry_auth_status, import_docker_config,
    set_registry_credentials,
};
pub use search::search_registry_images;
pub use types::{
    RegistryAuth, RegistryAuthStatus, RegistryConfig, RegistryImageResult, RegistryImportEntry,
    RegistrySearchRequest,
};
