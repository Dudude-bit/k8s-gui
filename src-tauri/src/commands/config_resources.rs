//! `ConfigMap` and Secret commands

use crate::commands::helpers::{get_resource_info, list_resource_infos, ResourceContext};
use crate::error::Result;
use crate::resources::{ConfigMapInfo, SecretInfo};
use crate::state::AppState;
use k8s_openapi::api::core::v1::ConfigMap;
use std::collections::BTreeMap;
use tauri::State;

use crate::commands::filters::{ResourceFilters, SecretFilters};

// ============================================================================
// ConfigMap Commands
// ============================================================================

/// List `ConfigMaps`
#[tauri::command]
pub async fn list_configmaps(
    filters: Option<ResourceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<ConfigMapInfo>> {
    list_resource_infos::<ConfigMap, ConfigMapInfo>(filters, state).await
}

/// Get a `ConfigMap` by name
#[tauri::command]
pub async fn get_configmap(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ConfigMapInfo> {
    crate::validation::validate_dns_subdomain(&name)?;
    get_resource_info::<ConfigMap, ConfigMapInfo>(name, namespace, state).await
}

/// Get `ConfigMap` data
#[tauri::command]
pub async fn get_configmap_data(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<BTreeMap<String, String>> {
    crate::validation::validate_dns_subdomain(&name)?;
    let configmap: ConfigMap =
        crate::commands::helpers::get_resource(name, namespace, state).await?;
    Ok(configmap.data.unwrap_or_default())
}

/// Delete `ConfigMap`
#[tauri::command]
pub async fn delete_configmap(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::validation::validate_dns_subdomain(&name)?;
    crate::commands::helpers::delete_resource::<ConfigMap>(name, namespace, state, None).await
}

// ============================================================================
// Secret Commands
// ============================================================================

use k8s_openapi::api::core::v1::Secret;

/// List Secrets
#[tauri::command]
pub async fn list_secrets(
    filters: Option<SecretFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<SecretInfo>> {
    let filters = filters.unwrap_or_default();
    let mut secrets: Vec<SecretInfo> =
        list_resource_infos::<Secret, SecretInfo>(Some(filters.base.clone()), state).await?;

    // Filter by type if specified
    if let Some(secret_type) = &filters.secret_type {
        secrets.retain(|s| s.type_.eq_ignore_ascii_case(secret_type));
    }

    Ok(secrets)
}

/// Get a Secret by name
#[tauri::command]
pub async fn get_secret(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<SecretInfo> {
    crate::validation::validate_dns_subdomain(&name)?;
    get_resource_info::<Secret, SecretInfo>(name, namespace, state).await
}

/// Get decoded Secret data (base64 decoded to UTF-8 strings)
#[tauri::command]
pub async fn get_secret_data(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<BTreeMap<String, String>> {
    crate::validation::validate_dns_subdomain(&name)?;
    let secret: Secret =
        crate::commands::helpers::get_resource(name, namespace, state).await?;

    let mut decoded_data = BTreeMap::new();

    if let Some(data) = secret.data {
        for (key, value) in data {
            // Decode base64 bytes to UTF-8 string (lossy for non-UTF8 binary data)
            let decoded = String::from_utf8_lossy(&value.0).to_string();
            decoded_data.insert(key, decoded);
        }
    }

    // Also include stringData if present (already strings)
    if let Some(string_data) = secret.string_data {
        for (key, value) in string_data {
            decoded_data.insert(key, value);
        }
    }

    Ok(decoded_data)
}

/// Get Secret YAML (with data redacted)
#[tauri::command]
pub async fn get_secret_yaml(
    name: String,
    namespace: Option<String>,
    redact: bool,
    state: State<'_, AppState>,
) -> Result<String> {
    crate::validation::validate_dns_subdomain(&name)?;
    let ctx = ResourceContext::for_command(&state, namespace)?;
    let api: kube::Api<Secret> = ctx.namespaced_api();
    let mut secret = api.get(&name).await?;

    if redact {
        if let Some(data) = &mut secret.data {
            for value in data.values_mut() {
                *value = k8s_openapi::ByteString(b"[REDACTED]".to_vec());
            }
        }
    }

    let yaml = serde_yaml::to_string(&secret)
        .map_err(|e| crate::error::Error::Serialization(e.to_string()))?;
    crate::commands::helpers::clean_yaml_for_editor(&yaml)
}

/// Delete Secret
#[tauri::command]
pub async fn delete_secret(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::validation::validate_dns_subdomain(&name)?;
    crate::commands::helpers::delete_resource::<Secret>(name, namespace, state, None).await
}
