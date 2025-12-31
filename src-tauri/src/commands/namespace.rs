//! Namespace management commands

use crate::commands::helpers::list_cluster_resources;
use crate::error::Result;
use crate::resources::NamespaceInfo;
use crate::state::AppState;
use k8s_openapi::api::core::v1::Namespace;
use tauri::State;

/// List all namespaces
#[tauri::command]
pub async fn list_namespaces(state: State<'_, AppState>) -> Result<Vec<NamespaceInfo>> {
    let list = list_cluster_resources::<Namespace>(state, None, None, None).await?;
    Ok(list.items.iter().map(NamespaceInfo::from).collect())
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
