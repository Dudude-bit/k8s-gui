//! Plugin management commands

use crate::plugins::{PluginInfo, PluginResult, PluginContext};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

/// Kubectl plugin info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KubectlPluginInfo {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
}

/// Helm release info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelmRelease {
    pub name: String,
    pub namespace: String,
    pub revision: i32,
    pub status: String,
    pub chart: String,
    pub app_version: Option<String>,
    pub updated: String,
}

/// Helm history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelmHistoryEntry {
    pub revision: i32,
    pub status: String,
    pub chart: String,
    pub app_version: Option<String>,
    pub description: String,
    pub updated: String,
}

/// Context menu item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextMenuItem {
    pub id: String,
    pub label: String,
    pub icon: Option<String>,
    pub shortcut: Option<String>,
}

/// Resource renderer info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceRendererInfo {
    pub name: String,
    pub supported_api_versions: Vec<String>,
    pub supported_kinds: Vec<String>,
}

/// Rendered resource
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderedResource {
    pub html: Option<String>,
    pub sections: Vec<serde_json::Value>,
}

/// List all plugins
#[tauri::command]
pub async fn list_plugins(
    state: State<'_, AppState>,
) -> Result<Vec<PluginInfo>, String> {
    Ok(state.plugin_manager.list_plugins())
}

/// Get plugin info by name
#[tauri::command]
pub async fn get_plugin(
    name: String,
    state: State<'_, AppState>,
) -> Result<Option<PluginInfo>, String> {
    Ok(state.plugin_manager.get_plugin_info(&name))
}

/// Enable a plugin
#[tauri::command]
pub async fn enable_plugin(
    name: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    // Stub: would update plugin state
    tracing::info!("Enabling plugin: {}", name);
    Ok(())
}

/// Disable a plugin
#[tauri::command]
pub async fn disable_plugin(
    name: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    // Stub: would update plugin state
    tracing::info!("Disabling plugin: {}", name);
    Ok(())
}

/// Discover available plugins
#[tauri::command]
pub async fn discover_plugins(
    state: State<'_, AppState>,
) -> Result<Vec<PluginInfo>, String> {
    // Return current list; discovery happens at startup
    Ok(state.plugin_manager.list_plugins())
}

/// Execute a plugin command
#[tauri::command]
pub async fn execute_plugin(
    name: String,
    args: Vec<String>,
    state: State<'_, AppState>,
) -> Result<PluginResult, String> {
    let context = state.get_current_context().unwrap_or_default();
    let namespace = state.get_namespace(&context);
    
    let ctx = PluginContext {
        kube_context: context,
        namespace,
        kubeconfig_path: None,
        env: HashMap::new(),
        work_dir: None,
        timeout_secs: 60,
    };
    
    state.plugin_manager.execute_command(&name, args.as_slice(), &ctx)
        .await
        .map_err(|e| e.to_string())
}

/// List kubectl plugins
#[tauri::command]
pub async fn list_kubectl_plugins(
    _state: State<'_, AppState>,
) -> Result<Vec<KubectlPluginInfo>, String> {
    use std::os::unix::fs::PermissionsExt;
    
    let mut plugins = Vec::new();
    let path_var = std::env::var("PATH").unwrap_or_default();
    
    for path_dir in path_var.split(':') {
        if let Ok(entries) = std::fs::read_dir(path_dir) {
            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.starts_with("kubectl-") {
                    if let Ok(meta) = entry.metadata() {
                        if meta.permissions().mode() & 0o111 != 0 {
                            let name = file_name.strip_prefix("kubectl-")
                                .unwrap_or(&file_name)
                                .replace('-', " ");
                            plugins.push(KubectlPluginInfo {
                                name,
                                path: entry.path().to_string_lossy().to_string(),
                                description: None,
                            });
                        }
                    }
                }
            }
        }
    }
    
    Ok(plugins)
}

/// Execute a kubectl plugin
#[tauri::command]
pub async fn execute_kubectl_plugin(
    name: String,
    args: Vec<String>,
    state: State<'_, AppState>,
) -> Result<PluginResult, String> {
    // Delegate to execute_plugin
    execute_plugin(name, args, state).await
}

/// List Helm releases
#[tauri::command]
pub async fn list_helm_releases(
    namespace: Option<String>,
    _state: State<'_, AppState>,
) -> Result<Vec<HelmRelease>, String> {
    let mut cmd = tokio::process::Command::new("helm");
    cmd.arg("list").arg("-o").arg("json");
    
    if let Some(ns) = namespace {
        cmd.arg("-n").arg(ns);
    } else {
        cmd.arg("-A");
    }
    
    let output = cmd.output().await.map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    let releases: Vec<HelmRelease> = serde_json::from_slice(&output.stdout)
        .map_err(|e| e.to_string())?;
    
    Ok(releases)
}

/// Get Helm release details
#[tauri::command]
pub async fn get_helm_release(
    name: String,
    namespace: String,
    _state: State<'_, AppState>,
) -> Result<HelmRelease, String> {
    let output = tokio::process::Command::new("helm")
        .args(["status", &name, "-n", &namespace, "-o", "json"])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    let release: HelmRelease = serde_json::from_slice(&output.stdout)
        .map_err(|e| e.to_string())?;
    
    Ok(release)
}

/// Get Helm release values
#[tauri::command]
pub async fn get_helm_values(
    name: String,
    namespace: String,
    all: Option<bool>,
    _state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut cmd = tokio::process::Command::new("helm");
    cmd.args(["get", "values", &name, "-n", &namespace, "-o", "json"]);
    
    if all.unwrap_or(false) {
        cmd.arg("-a");
    }
    
    let output = cmd.output().await.map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    let values: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| e.to_string())?;
    
    Ok(values)
}

/// Get Helm release manifest
#[tauri::command]
pub async fn get_helm_manifest(
    name: String,
    namespace: String,
    _state: State<'_, AppState>,
) -> Result<String, String> {
    let output = tokio::process::Command::new("helm")
        .args(["get", "manifest", &name, "-n", &namespace])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Get Helm release history
#[tauri::command]
pub async fn get_helm_history(
    name: String,
    namespace: String,
    _state: State<'_, AppState>,
) -> Result<Vec<HelmHistoryEntry>, String> {
    let output = tokio::process::Command::new("helm")
        .args(["history", &name, "-n", &namespace, "-o", "json"])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    let history: Vec<HelmHistoryEntry> = serde_json::from_slice(&output.stdout)
        .map_err(|e| e.to_string())?;
    
    Ok(history)
}

/// Rollback Helm release
#[tauri::command]
pub async fn rollback_helm_release(
    name: String,
    namespace: String,
    revision: i32,
    _state: State<'_, AppState>,
) -> Result<String, String> {
    let output = tokio::process::Command::new("helm")
        .args(["rollback", &name, &revision.to_string(), "-n", &namespace])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Uninstall Helm release
#[tauri::command]
pub async fn uninstall_helm_release(
    name: String,
    namespace: String,
    _state: State<'_, AppState>,
) -> Result<String, String> {
    let output = tokio::process::Command::new("helm")
        .args(["uninstall", &name, "-n", &namespace])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Get context menu items for a resource
#[tauri::command]
pub async fn get_context_menu_items(
    resource: serde_json::Value,
    _state: State<'_, AppState>,
) -> Result<Vec<(String, Vec<ContextMenuItem>)>, String> {
    // Stub: would get menu items from plugins
    Ok(vec![])
}

/// Execute a context menu action
#[tauri::command]
pub async fn execute_context_menu_action(
    plugin_name: String,
    action_id: String,
    resource: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<PluginResult, String> {
    let context = state.get_current_context().unwrap_or_default();
    let namespace = state.get_namespace(&context);
    
    let _ctx = PluginContext {
        kube_context: context,
        namespace,
        kubeconfig_path: None,
        env: HashMap::new(),
        work_dir: None,
        timeout_secs: 60,
    };
    
    // Stub: would execute menu action
    tracing::info!("Execute context menu action: {}:{} on {:?}", plugin_name, action_id, resource);
    
    Ok(PluginResult::success(format!("Action {} executed", action_id)))
}

/// Get available resource renderers
#[tauri::command]
pub async fn get_resource_renderers(
    _state: State<'_, AppState>,
) -> Result<Vec<ResourceRendererInfo>, String> {
    // Stub: would list registered renderers
    Ok(vec![
        ResourceRendererInfo {
            name: "helm".to_string(),
            supported_api_versions: vec!["apps/v1".to_string()],
            supported_kinds: vec!["Deployment".to_string(), "StatefulSet".to_string()],
        },
    ])
}

/// Render a resource using a custom renderer
#[tauri::command]
pub async fn render_resource(
    resource: serde_json::Value,
    _state: State<'_, AppState>,
) -> Result<Option<RenderedResource>, String> {
    // Stub: would render using appropriate renderer
    let _ = resource;
    Ok(None)
}

// Re-export execute_plugin_command for backwards compatibility
pub use execute_plugin as execute_plugin_command;
