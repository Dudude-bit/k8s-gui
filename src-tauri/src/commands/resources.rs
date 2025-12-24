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

