//! Settings and configuration commands

use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Theme configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeConfig {
    pub dark_mode: bool,
    pub accent_color: String,
    pub font_size: u8,
    pub compact: bool,
}

/// Kubernetes configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KubernetesConfig {
    pub default_namespace: String,
    pub kubeconfig_path: Option<String>,
    pub timeout_seconds: u64,
    pub enable_watch: bool,
    pub refresh_interval: u64,
}

/// Cache configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheConfig {
    pub enabled: bool,
    pub ttl_seconds: u64,
    pub max_entries: usize,
}

/// Plugin configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginConfig {
    pub kubectl_plugins: bool,
    pub plugin_dirs: Vec<String>,
    pub timeout_seconds: u64,
    pub disabled: Vec<String>,
}

/// Logging configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoggingConfig {
    pub level: String,
    pub file: Option<String>,
}

/// Keyboard shortcut
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardShortcut {
    pub id: String,
    pub action: String,
    pub keys: String,
    pub description: String,
}

/// App info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub name: String,
    pub tauri_version: String,
}

/// Clear the resource cache
#[tauri::command]
pub async fn clear_cache(
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.cache.clear();
    Ok(())
}

