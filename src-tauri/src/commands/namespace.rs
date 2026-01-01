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
