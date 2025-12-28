//! ConfigMap and Secret commands

use crate::commands::helpers::{build_list_params, CommandContext, ListContext};
use crate::error::Result;
use crate::resources::{ConfigMapInfo, SecretInfo};
use crate::state::AppState;
use k8s_openapi::api::core::v1::ConfigMap;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tauri::State;

use crate::commands::filters::ResourceFilters;

// ============================================================================
// ConfigMap Commands
// ============================================================================

/// List ConfigMaps
#[tauri::command]
pub async fn list_configmaps(
    filters: Option<ResourceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<ConfigMapInfo>> {
    let filters = filters.unwrap_or_default();
    
    let list = crate::commands::helpers::list_resources::<ConfigMap>(
        filters.namespace,
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    ).await?;

    Ok(list.items.iter().map(ConfigMapInfo::from).collect())
}

/// Get a ConfigMap by name
#[tauri::command]
pub async fn get_configmap(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ConfigMapInfo> {
    let ctx = CommandContext::new(&state, namespace)?;
    let api: kube::Api<ConfigMap> = ctx.namespaced_api();
    let configmap = api.get(&name).await?;

    Ok(ConfigMapInfo::from(&configmap))
}

/// Get ConfigMap data
#[tauri::command]
pub async fn get_configmap_data(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<BTreeMap<String, String>> {
    let ctx = CommandContext::new(&state, namespace)?;
    let api: kube::Api<ConfigMap> = ctx.namespaced_api();
    let configmap = api.get(&name).await?;

    Ok(configmap.data.unwrap_or_default())
}

/// Get ConfigMap YAML
#[tauri::command]
pub async fn get_configmap_yaml(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    super::helpers::get_resource_yaml::<ConfigMap>(name, namespace, state).await
}

/// Create ConfigMap
#[tauri::command]
pub async fn create_configmap(
    name: String,
    data: BTreeMap<String, String>,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ConfigMapInfo> {
    let ctx = CommandContext::new(&state, namespace)?;

    let configmap = ConfigMap {
        metadata: k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta {
            name: Some(name),
            namespace: Some(ctx.namespace.clone()),
            ..Default::default()
        },
        data: Some(data),
        ..Default::default()
    };

    let api: kube::Api<ConfigMap> = ctx.namespaced_api();
    let created = api.create(&kube::api::PostParams::default(), &configmap).await?;

    Ok(ConfigMapInfo::from(&created))
}

/// Update ConfigMap data
#[tauri::command]
pub async fn update_configmap(
    name: String,
    data: BTreeMap<String, String>,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ConfigMapInfo> {
    let ctx = CommandContext::new(&state, namespace)?;

    let patch = serde_json::json!({ "data": data });

    let api: kube::Api<ConfigMap> = ctx.namespaced_api();
    let updated = api
        .patch(&name, &kube::api::PatchParams::default(), &kube::api::Patch::Merge(&patch))
        .await?;

    Ok(ConfigMapInfo::from(&updated))
}

/// Delete ConfigMap
#[tauri::command]
pub async fn delete_configmap(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    super::helpers::delete_resource::<ConfigMap>(name, namespace, state, None).await
}

// ============================================================================
// Secret Commands
// ============================================================================

use k8s_openapi::api::core::v1::Secret;

/// Secret filters
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SecretFilters {
    pub namespace: Option<String>,
    pub label_selector: Option<String>,
    pub field_selector: Option<String>,
    pub secret_type: Option<String>,
    pub limit: Option<i64>,
}

/// List Secrets
#[tauri::command]
pub async fn list_secrets(
    filters: Option<SecretFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<SecretInfo>> {
    let filters = filters.unwrap_or_default();
    
    let list = crate::commands::helpers::list_resources::<Secret>(
        filters.namespace,
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    ).await?;

    let mut secrets: Vec<SecretInfo> = list.items.iter().map(SecretInfo::from).collect();

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
    let ctx = CommandContext::new(&state, namespace)?;
    let api: kube::Api<Secret> = ctx.namespaced_api();
    let secret = api.get(&name).await?;

    Ok(SecretInfo::from(&secret))
}

/// Get Secret data (decoded from base64)
#[tauri::command]
pub async fn get_secret_data(
    name: String,
    namespace: Option<String>,
    decode: bool,
    state: State<'_, AppState>,
) -> Result<BTreeMap<String, String>> {
    let ctx = CommandContext::new(&state, namespace)?;
    let api: kube::Api<Secret> = ctx.namespaced_api();
    let secret = api.get(&name).await?;

    let data = secret.data.unwrap_or_default();

    if decode {
        Ok(data
            .into_iter()
            .map(|(k, v)| {
                let decoded_value =
                    String::from_utf8(v.0).unwrap_or_else(|_| "[binary data]".to_string());
                (k, decoded_value)
            })
            .collect())
    } else {
        Ok(data
            .into_iter()
            .map(|(k, v)| {
                let encoded_value =
                    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &v.0);
                (k, encoded_value)
            })
            .collect())
    }
}

/// Get Secret YAML (with data redacted)
#[tauri::command]
pub async fn get_secret_yaml(
    name: String,
    namespace: Option<String>,
    redact: bool,
    state: State<'_, AppState>,
) -> Result<String> {
    let ctx = CommandContext::new(&state, namespace)?;
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
    super::helpers::clean_yaml_for_editor(&yaml)
}

/// Create Secret
#[tauri::command]
pub async fn create_secret(
    name: String,
    data: BTreeMap<String, String>,
    secret_type: Option<String>,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<SecretInfo> {
    let ctx = CommandContext::new(&state, namespace)?;

    let encoded_data: BTreeMap<String, k8s_openapi::ByteString> = data
        .into_iter()
        .map(|(k, v)| (k, k8s_openapi::ByteString(v.into_bytes())))
        .collect();

    let secret = Secret {
        metadata: k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta {
            name: Some(name),
            namespace: Some(ctx.namespace.clone()),
            ..Default::default()
        },
        type_: Some(secret_type.unwrap_or_else(|| "Opaque".to_string())),
        data: Some(encoded_data),
        ..Default::default()
    };

    let api: kube::Api<Secret> = ctx.namespaced_api();
    let created = api.create(&kube::api::PostParams::default(), &secret).await?;

    Ok(SecretInfo::from(&created))
}

/// Update Secret data
#[tauri::command]
pub async fn update_secret(
    name: String,
    data: BTreeMap<String, String>,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<SecretInfo> {
    let ctx = CommandContext::new(&state, namespace)?;

    let encoded_data: BTreeMap<String, String> = data
        .into_iter()
        .map(|(k, v)| {
            let encoded =
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, v.as_bytes());
            (k, encoded)
        })
        .collect();

    let patch = serde_json::json!({ "data": encoded_data });

    let api: kube::Api<Secret> = ctx.namespaced_api();
    let updated = api
        .patch(&name, &kube::api::PatchParams::default(), &kube::api::Patch::Merge(&patch))
        .await?;

    Ok(SecretInfo::from(&updated))
}

/// Delete Secret
#[tauri::command]
pub async fn delete_secret(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    super::helpers::delete_resource::<Secret>(name, namespace, state, None).await
}
