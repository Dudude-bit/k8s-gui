//! Cluster management commands

use crate::client::{ClusterInfo, ContextInfo};
use crate::state::AppState;
use tauri::State;

/// List all available Kubernetes contexts
#[tauri::command]
pub async fn list_contexts(state: State<'_, AppState>) -> Result<Vec<ContextInfo>, String> {
    // Ensure kubeconfig is loaded
    state
        .client_manager
        .load_kubeconfig()
        .await
        .map_err(|e| e.to_string())?;

    state
        .client_manager
        .list_contexts()
        .await
        .map_err(|e| e.to_string())
}

/// Get the current active context
#[tauri::command]
pub async fn get_current_context(state: State<'_, AppState>) -> Result<Option<String>, String> {
    state.client_manager
        .load_kubeconfig()
        .await
        .map_err(|e| e.to_string())?;
    
    state
        .client_manager
        .get_current_context()
        .await
        .map_err(|e| e.to_string())
}

/// Switch to a different context
#[tauri::command]
pub async fn switch_context(context: String, state: State<'_, AppState>) -> Result<(), String> {
    // Disconnect from current context if connected
    if let Some(current) = state.get_current_context() {
        state.client_manager.disconnect(&current);
    }

    // Load kubeconfig if not already loaded
    state
        .client_manager
        .load_kubeconfig()
        .await
        .map_err(|e| e.to_string())?;

    // Connect to new context
    state
        .client_manager
        .connect(&context)
        .await
        .map_err(|e| e.to_string())?;

    // Update state
    state.set_current_context(Some(context.clone()));
    state.create_session(&context);

    // Emit connection event
    state.emit(crate::state::AppEvent::ConnectionStatusChanged {
        context: context.clone(),
        connected: true,
    });

    tracing::info!("Switched to context: {}", context);
    Ok(())
}

/// Connect to a cluster by context name
#[tauri::command]
pub async fn connect_cluster(context: String, state: State<'_, AppState>) -> Result<ClusterInfo, String> {
    // Load kubeconfig if not already loaded
    state
        .client_manager
        .load_kubeconfig()
        .await
        .map_err(|e| e.to_string())?;

    // Test connection and get cluster info
    let info = state
        .client_manager
        .test_connection(&context)
        .await
        .map_err(|e| e.to_string())?;

    // Update state
    state.set_current_context(Some(context.clone()));
    state.create_session(&context);

    // Emit connection event
    state.emit(crate::state::AppEvent::ConnectionStatusChanged {
        context: context.clone(),
        connected: true,
    });

    Ok(info)
}

/// Disconnect from a cluster
#[tauri::command]
pub async fn disconnect_cluster(context: String, state: State<'_, AppState>) -> Result<(), String> {
    state.client_manager.disconnect(&context);
    state.remove_session(&context);

    // Clear current context if it matches
    if state.get_current_context().as_ref() == Some(&context) {
        state.set_current_context(None);
    }

    // Emit connection event
    state.emit(crate::state::AppEvent::ConnectionStatusChanged {
        context: context.clone(),
        connected: false,
    });

    tracing::info!("Disconnected from cluster: {}", context);
    Ok(())
}

/// Get cluster information
#[tauri::command]
pub async fn get_cluster_info(context: String, state: State<'_, AppState>) -> Result<ClusterInfo, String> {
    state
        .client_manager
        .test_connection(&context)
        .await
        .map_err(|e| e.to_string())
}
