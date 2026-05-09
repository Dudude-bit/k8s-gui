//! `ConfigMap` and Secret commands plus the cross-resource
//! "find references" scanner.
//!
//! - `configmap`:   ConfigMap CRUD
//! - `secret`:      Secret CRUD (with redacted YAML)
//! - `references`:  scan workloads + ingresses for refs to a
//!                  given ConfigMap or Secret

mod configmap;
mod references;
mod secret;

pub use configmap::{delete_configmap, get_configmap, get_configmap_data, list_configmaps};
pub use references::{
    get_resource_references, IngressReference, ResourceReference, ResourceReferences,
    VolumeReference,
};
pub use secret::{delete_secret, get_secret, get_secret_data, get_secret_yaml, list_secrets};
