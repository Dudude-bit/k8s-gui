//! Namespace management commands

use crate::error::{Error, Result};
use crate::resources::NamespaceInfo;
use crate::state::AppState;
use tauri::State;

/// List all namespaces
#[tauri::command]
pub async fn list_namespaces(state: State<'_, AppState>) -> Result<Vec<NamespaceInfo>> {
    let context = state
        .get_current_context()
        .ok_or_else(|| Error::Internal("No cluster connected".to_string()))?;

    let client = state.client_manager.resource_client(&context).await?;

    let namespaces = client.list_namespaces(None).await?;

    Ok(namespaces.iter().map(NamespaceInfo::from).collect())
}

/// Switch to a different namespace
#[tauri::command]
pub fn switch_namespace(namespace: String, state: State<'_, AppState>) -> Result<()> {
    let context = state
        .get_current_context()
        .ok_or_else(|| Error::Internal("No cluster connected".to_string()))?;

    state.set_namespace(&context, &namespace);
    tracing::info!("Switched to namespace: {}", namespace);

    Ok(())
}
