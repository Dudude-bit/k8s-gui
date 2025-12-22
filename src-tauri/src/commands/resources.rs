//! Generic resource management commands

use crate::resources::{GenericResource, ResourceKind, ResourceList};
use crate::state::AppState;
use crate::utils::{normalize_namespace, require_namespace};
use kube::api::ListParams;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Resource query parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceQuery {
    pub kind: String,
    pub namespace: Option<String>,
    pub name: Option<String>,
    pub label_selector: Option<String>,
    pub field_selector: Option<String>,
    pub limit: Option<i64>,
}

/// List resources of a given kind
#[tauri::command]
pub async fn list_resources(
    query: ResourceQuery,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = normalize_namespace(query.namespace, state.get_namespace(&context));
    
    // Build list params
    let mut params = ListParams::default();
    if let Some(labels) = &query.label_selector {
        params = params.labels(labels);
    }
    if let Some(fields) = &query.field_selector {
        params = params.fields(fields);
    }
    if let Some(limit) = query.limit {
        if limit > 0 {
            params = params.limit(limit as u32);
        }
    }

    // This is a simplified implementation
    // In production, we'd use dynamic API discovery
    let result = match query.kind.as_str() {
        "Pod" | "pods" => {
            let api: kube::Api<k8s_openapi::api::core::v1::Pod> = match namespace.as_ref() {
                Some(ns) => kube::Api::namespaced((*client).clone(), ns),
                None => kube::Api::all((*client).clone()),
            };
            let list = api.list(&params).await.map_err(|e| e.to_string())?;
            list.items.iter().map(|r| serde_json::to_value(r)).collect::<Result<Vec<_>, _>>()
        }
        "Deployment" | "deployments" => {
            let api: kube::Api<k8s_openapi::api::apps::v1::Deployment> = match namespace.as_ref() {
                Some(ns) => kube::Api::namespaced((*client).clone(), ns),
                None => kube::Api::all((*client).clone()),
            };
            let list = api.list(&params).await.map_err(|e| e.to_string())?;
            list.items.iter().map(|r| serde_json::to_value(r)).collect::<Result<Vec<_>, _>>()
        }
        "Service" | "services" => {
            let api: kube::Api<k8s_openapi::api::core::v1::Service> = match namespace.as_ref() {
                Some(ns) => kube::Api::namespaced((*client).clone(), ns),
                None => kube::Api::all((*client).clone()),
            };
            let list = api.list(&params).await.map_err(|e| e.to_string())?;
            list.items.iter().map(|r| serde_json::to_value(r)).collect::<Result<Vec<_>, _>>()
        }
        "ConfigMap" | "configmaps" => {
            let api: kube::Api<k8s_openapi::api::core::v1::ConfigMap> = match namespace.as_ref() {
                Some(ns) => kube::Api::namespaced((*client).clone(), ns),
                None => kube::Api::all((*client).clone()),
            };
            let list = api.list(&params).await.map_err(|e| e.to_string())?;
            list.items.iter().map(|r| serde_json::to_value(r)).collect::<Result<Vec<_>, _>>()
        }
        "Secret" | "secrets" => {
            let api: kube::Api<k8s_openapi::api::core::v1::Secret> = match namespace.as_ref() {
                Some(ns) => kube::Api::namespaced((*client).clone(), ns),
                None => kube::Api::all((*client).clone()),
            };
            let list = api.list(&params).await.map_err(|e| e.to_string())?;
            list.items.iter().map(|r| serde_json::to_value(r)).collect::<Result<Vec<_>, _>>()
        }
        "Node" | "nodes" => {
            let api: kube::Api<k8s_openapi::api::core::v1::Node> = 
                kube::Api::all((*client).clone());
            let list = api.list(&params).await.map_err(|e| e.to_string())?;
            list.items.iter().map(|r| serde_json::to_value(r)).collect::<Result<Vec<_>, _>>()
        }
        "Namespace" | "namespaces" => {
            let api: kube::Api<k8s_openapi::api::core::v1::Namespace> = 
                kube::Api::all((*client).clone());
            let list = api.list(&params).await.map_err(|e| e.to_string())?;
            list.items.iter().map(|r| serde_json::to_value(r)).collect::<Result<Vec<_>, _>>()
        }
        _ => return Err(format!("Unsupported resource kind: {}", query.kind)),
    };

    result.map_err(|e| e.to_string())
}

/// Get a single resource by name
#[tauri::command]
pub async fn get_resource(
    kind: String,
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace = require_namespace(namespace, state.get_namespace(&context))
        .map_err(|e| e.to_string())?;

    let result = match kind.as_str() {
        "Pod" | "pods" => {
            let api: kube::Api<k8s_openapi::api::core::v1::Pod> = 
                kube::Api::namespaced((*client).clone(), &namespace);
            let resource = api.get(&name).await.map_err(|e| e.to_string())?;
            serde_json::to_value(resource)
        }
        "Deployment" | "deployments" => {
            let api: kube::Api<k8s_openapi::api::apps::v1::Deployment> = 
                kube::Api::namespaced((*client).clone(), &namespace);
            let resource = api.get(&name).await.map_err(|e| e.to_string())?;
            serde_json::to_value(resource)
        }
        "Service" | "services" => {
            let api: kube::Api<k8s_openapi::api::core::v1::Service> = 
                kube::Api::namespaced((*client).clone(), &namespace);
            let resource = api.get(&name).await.map_err(|e| e.to_string())?;
            serde_json::to_value(resource)
        }
        _ => return Err(format!("Unsupported resource kind: {}", kind)),
    };

    result.map_err(|e| e.to_string())
}

/// Create a new resource
#[tauri::command]
pub async fn create_resource(
    resource: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let _client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    // Extract kind and metadata
    let kind = resource
        .get("kind")
        .and_then(|k| k.as_str())
        .ok_or_else(|| "Resource must have a kind".to_string())?;

    let _namespace = resource
        .get("metadata")
        .and_then(|m| m.get("namespace"))
        .and_then(|n| n.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| state.get_namespace(&context));

    // TODO: Implement resource creation for each kind
    Err(format!("Create not yet implemented for kind: {}", kind))
}

/// Update an existing resource
#[tauri::command]
pub async fn update_resource(
    resource: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let _client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let kind = resource
        .get("kind")
        .and_then(|k| k.as_str())
        .ok_or_else(|| "Resource must have a kind".to_string())?;

    // TODO: Implement resource update for each kind
    Err(format!("Update not yet implemented for kind: {}", kind))
}

/// Delete a resource
#[tauri::command]
pub async fn delete_resource(
    kind: String,
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

    let namespace = require_namespace(namespace, state.get_namespace(&context))
        .map_err(|e| e.to_string())?;
    let dp = kube::api::DeleteParams::default();

    match kind.as_str() {
        "Pod" | "pods" => {
            let api: kube::Api<k8s_openapi::api::core::v1::Pod> = 
                kube::Api::namespaced((*client).clone(), &namespace);
            api.delete(&name, &dp).await.map_err(|e| e.to_string())?;
        }
        "Deployment" | "deployments" => {
            let api: kube::Api<k8s_openapi::api::apps::v1::Deployment> = 
                kube::Api::namespaced((*client).clone(), &namespace);
            api.delete(&name, &dp).await.map_err(|e| e.to_string())?;
        }
        "Service" | "services" => {
            let api: kube::Api<k8s_openapi::api::core::v1::Service> = 
                kube::Api::namespaced((*client).clone(), &namespace);
            api.delete(&name, &dp).await.map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("Delete not supported for kind: {}", kind)),
    };

    Ok(())
}

/// Start watching resources
#[tauri::command]
pub async fn watch_resources(
    kind: String,
    namespace: Option<String>,
    label_selector: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let _client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let watch_id = state.new_watch_id();

    // TODO: Implement watch functionality with proper streaming
    // This would spawn a background task that watches resources
    // and emits WatchEvent through the event channel

    Ok(watch_id)
}

/// Stop watching resources
#[tauri::command]
pub async fn stop_watch(watch_id: String, state: State<'_, AppState>) -> Result<(), String> {
    if let Some((_, subscription)) = state.watch_subscriptions.remove(&watch_id) {
        let _ = subscription.cancel_tx.send(());
    }
    Ok(())
}
