//! CRD (Custom Resource Definition) commands.
//!
//! Commands for managing CRDs and the custom-resource instances they
//! define. Split into:
//! - `types`: frontend-facing structs
//! - `convert`: kube → frontend conversions
//! - `crd`: Tauri commands operating on CRDs themselves
//! - `instance`: Tauri commands operating on custom-resource instances

mod convert;
mod crd;
mod instance;
mod types;

pub use convert::dynamic_object_to_custom_resource_info;
pub use crd::{delete_crd, get_crd, get_crd_schema, get_crd_yaml, list_crds};
pub use instance::{
    delete_custom_resource, get_custom_resource, get_custom_resource_yaml, list_custom_resources,
};
pub use types::{
    CrdAcceptedNames, CrdCondition, CrdDetailInfo, CrdGroup, CrdInfo, CrdVersionInfo,
    CustomResourceDetailInfo, CustomResourceInfo, OwnerReferenceInfo, PrinterColumn,
};
