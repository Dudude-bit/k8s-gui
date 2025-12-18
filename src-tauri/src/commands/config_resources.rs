//! ConfigMap and Secret commands

use crate::resources::{ConfigMapInfo, SecretInfo};
use crate::state::AppState;
use kube::api::ListParams;
use serde::{Deserialize, Serialize};
use tauri::State;
use std::collections::BTreeMap;

// ============================================================================
// ConfigMap Commands
// ============================================================================

/// ConfigMap filters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigMapFilters {
    pub namespace: Option<String>,
    pub label_selector: Option<String>,
}

/// List ConfigMaps
#[tauri::command]
pub async fn list_configmaps(
    filters: Option<ConfigMapFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<ConfigMapInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let filters = filters.unwrap_or_else(|| ConfigMapFilters {
        namespace: None,
        label_selector: None,
    });

    let namespace = filters.namespace.unwrap_or_else(|| state.get_namespace(&context));

    let mut params = ListParams::default();
    if let Some(labels) = &filters.label_selector {
        params = params.labels(labels);
    }

    let api: kube::Api<k8s_openapi::api::core::v1::ConfigMap> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let list = api.list(&params).await.map_err(|e| e.to_string())?;

    let configmaps: Vec<ConfigMapInfo> = list.items.iter().map(ConfigMapInfo::from).collect();

    Ok(configmaps)
}

/// Get a ConfigMap by name
#[tauri::command]
pub async fn get_configmap(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ConfigMapInfo, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = namespace.unwrap_or_else(|| state.get_namespace(&context));

    let api: kube::Api<k8s_openapi::api::core::v1::ConfigMap> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let configmap = api.get(&name).await.map_err(|e| e.to_string())?;

    Ok(ConfigMapInfo::from(&configmap))
}

/// Get ConfigMap data
#[tauri::command]
pub async fn get_configmap_data(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<BTreeMap<String, String>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = namespace.unwrap_or_else(|| state.get_namespace(&context));

    let api: kube::Api<k8s_openapi::api::core::v1::ConfigMap> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let configmap = api.get(&name).await.map_err(|e| e.to_string())?;

    Ok(configmap.data.unwrap_or_default())
}

/// Get ConfigMap YAML
#[tauri::command]
pub async fn get_configmap_yaml(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = namespace.unwrap_or_else(|| state.get_namespace(&context));

    let api: kube::Api<k8s_openapi::api::core::v1::ConfigMap> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let configmap = api.get(&name).await.map_err(|e| e.to_string())?;

    serde_yaml::to_string(&configmap).map_err(|e| e.to_string())
}

/// Create ConfigMap
#[tauri::command]
pub async fn create_configmap(
    name: String,
    data: BTreeMap<String, String>,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ConfigMapInfo, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = namespace.unwrap_or_else(|| state.get_namespace(&context));

    let configmap = k8s_openapi::api::core::v1::ConfigMap {
        metadata: k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta {
            name: Some(name),
            namespace: Some(namespace.clone()),
            ..Default::default()
        },
        data: Some(data),
        ..Default::default()
    };

    let api: kube::Api<k8s_openapi::api::core::v1::ConfigMap> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let created = api.create(&kube::api::PostParams::default(), &configmap)
        .await
        .map_err(|e| e.to_string())?;

    Ok(ConfigMapInfo::from(&created))
}

/// Update ConfigMap data
#[tauri::command]
pub async fn update_configmap(
    name: String,
    data: BTreeMap<String, String>,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ConfigMapInfo, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = namespace.unwrap_or_else(|| state.get_namespace(&context));

    let patch = serde_json::json!({
        "data": data
    });

    let api: kube::Api<k8s_openapi::api::core::v1::ConfigMap> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let updated = api.patch(&name, &kube::api::PatchParams::default(), &kube::api::Patch::Merge(&patch))
        .await
        .map_err(|e| e.to_string())?;

    Ok(ConfigMapInfo::from(&updated))
}

/// Delete ConfigMap
#[tauri::command]
pub async fn delete_configmap(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = namespace.unwrap_or_else(|| state.get_namespace(&context));

    let api: kube::Api<k8s_openapi::api::core::v1::ConfigMap> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    api.delete(&name, &kube::api::DeleteParams::default())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============================================================================
// Secret Commands
// ============================================================================

/// Secret filters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretFilters {
    pub namespace: Option<String>,
    pub label_selector: Option<String>,
    pub secret_type: Option<String>,
}

/// List Secrets
#[tauri::command]
pub async fn list_secrets(
    filters: Option<SecretFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<SecretInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let filters = filters.unwrap_or_else(|| SecretFilters {
        namespace: None,
        label_selector: None,
        secret_type: None,
    });

    let namespace = filters.namespace.unwrap_or_else(|| state.get_namespace(&context));

    let mut params = ListParams::default();
    if let Some(labels) = &filters.label_selector {
        params = params.labels(labels);
    }

    let api: kube::Api<k8s_openapi::api::core::v1::Secret> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let list = api.list(&params).await.map_err(|e| e.to_string())?;

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
) -> Result<SecretInfo, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = namespace.unwrap_or_else(|| state.get_namespace(&context));

    let api: kube::Api<k8s_openapi::api::core::v1::Secret> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let secret = api.get(&name).await.map_err(|e| e.to_string())?;

    Ok(SecretInfo::from(&secret))
}

/// Get Secret data (decoded from base64)
#[tauri::command]
pub async fn get_secret_data(
    name: String,
    namespace: Option<String>,
    decode: bool,
    state: State<'_, AppState>,
) -> Result<BTreeMap<String, String>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = namespace.unwrap_or_else(|| state.get_namespace(&context));

    let api: kube::Api<k8s_openapi::api::core::v1::Secret> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let secret = api.get(&name).await.map_err(|e| e.to_string())?;

    let data = secret.data.unwrap_or_default();
    
    if decode {
        let decoded: BTreeMap<String, String> = data
            .into_iter()
            .map(|(k, v)| {
                let decoded_value = String::from_utf8(v.0).unwrap_or_else(|_| "[binary data]".to_string());
                (k, decoded_value)
            })
            .collect();
        Ok(decoded)
    } else {
        // Return base64 encoded
        let encoded: BTreeMap<String, String> = data
            .into_iter()
            .map(|(k, v)| {
                let encoded_value = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &v.0);
                (k, encoded_value)
            })
            .collect();
        Ok(encoded)
    }
}

/// Get Secret YAML (with data redacted)
#[tauri::command]
pub async fn get_secret_yaml(
    name: String,
    namespace: Option<String>,
    redact: bool,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = namespace.unwrap_or_else(|| state.get_namespace(&context));

    let api: kube::Api<k8s_openapi::api::core::v1::Secret> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let mut secret = api.get(&name).await.map_err(|e| e.to_string())?;

    if redact {
        // Replace data values with placeholder
        if let Some(data) = &mut secret.data {
            for value in data.values_mut() {
                *value = k8s_openapi::ByteString(b"[REDACTED]".to_vec());
            }
        }
    }

    serde_yaml::to_string(&secret).map_err(|e| e.to_string())
}

/// Create Secret
#[tauri::command]
pub async fn create_secret(
    name: String,
    data: BTreeMap<String, String>,
    secret_type: Option<String>,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<SecretInfo, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = namespace.unwrap_or_else(|| state.get_namespace(&context));

    // Encode data to base64
    let encoded_data: BTreeMap<String, k8s_openapi::ByteString> = data
        .into_iter()
        .map(|(k, v)| (k, k8s_openapi::ByteString(v.into_bytes())))
        .collect();

    let secret = k8s_openapi::api::core::v1::Secret {
        metadata: k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta {
            name: Some(name),
            namespace: Some(namespace.clone()),
            ..Default::default()
        },
        type_: Some(secret_type.unwrap_or_else(|| "Opaque".to_string())),
        data: Some(encoded_data),
        ..Default::default()
    };

    let api: kube::Api<k8s_openapi::api::core::v1::Secret> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let created = api.create(&kube::api::PostParams::default(), &secret)
        .await
        .map_err(|e| e.to_string())?;

    Ok(SecretInfo::from(&created))
}

/// Update Secret data
#[tauri::command]
pub async fn update_secret(
    name: String,
    data: BTreeMap<String, String>,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<SecretInfo, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = namespace.unwrap_or_else(|| state.get_namespace(&context));

    // Encode data to base64 and convert to JSON for patch
    let encoded_data: BTreeMap<String, String> = data
        .into_iter()
        .map(|(k, v)| {
            let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, v.as_bytes());
            (k, encoded)
        })
        .collect();

    let patch = serde_json::json!({
        "data": encoded_data
    });

    let api: kube::Api<k8s_openapi::api::core::v1::Secret> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    let updated = api.patch(&name, &kube::api::PatchParams::default(), &kube::api::Patch::Merge(&patch))
        .await
        .map_err(|e| e.to_string())?;

    Ok(SecretInfo::from(&updated))
}

/// Delete Secret
#[tauri::command]
pub async fn delete_secret(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = namespace.unwrap_or_else(|| state.get_namespace(&context));

    let api: kube::Api<k8s_openapi::api::core::v1::Secret> = 
        kube::Api::namespaced((*client).clone(), &namespace);
    api.delete(&name, &kube::api::DeleteParams::default())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
