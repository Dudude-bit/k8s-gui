//! Namespace management commands

use crate::resources::NamespaceInfo;
use crate::state::AppState;
use k8s_openapi::api::core::v1::Namespace;
use tauri::State;

/// List all namespaces
#[tauri::command]
pub async fn list_namespaces(state: State<'_, AppState>) -> Result<Vec<NamespaceInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .resource_client(&context)
        .await
        .map_err(|e| e.to_string())?;

    let namespaces = client
        .list_namespaces(None)
        .await
        .map_err(|e| e.to_string())?;

    Ok(namespaces.iter().map(NamespaceInfo::from).collect())
}

/// Get current namespace for the active context
#[tauri::command]
pub async fn get_current_namespace(state: State<'_, AppState>) -> Result<String, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    Ok(state.get_namespace(&context))
}

/// Switch to a different namespace
#[tauri::command]
pub async fn switch_namespace(namespace: String, state: State<'_, AppState>) -> Result<(), String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    state.set_namespace(&context, &namespace);
    tracing::info!("Switched to namespace: {}", namespace);
    
    Ok(())
}
