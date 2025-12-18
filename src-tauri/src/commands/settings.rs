//! Settings and configuration commands

use crate::config::AppConfig;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use std::path::PathBuf;

/// Theme configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeConfig {
    pub dark_mode: bool,
    pub accent_color: String,
    pub font_size: u8,
    pub compact: bool,
}

/// Kubernetes configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KubernetesConfig {
    pub default_namespace: String,
    pub kubeconfig_path: Option<String>,
    pub timeout_seconds: u64,
    pub enable_watch: bool,
    pub refresh_interval: u64,
}

/// Cache configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheConfig {
    pub enabled: bool,
    pub ttl_seconds: u64,
    pub max_entries: usize,
}

/// Plugin configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginConfig {
    pub kubectl_plugins: bool,
    pub plugin_dirs: Vec<String>,
    pub timeout_seconds: u64,
    pub disabled: Vec<String>,
}

/// Logging configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    pub level: String,
    pub file: Option<String>,
}

/// Keyboard shortcut
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyboardShortcut {
    pub id: String,
    pub action: String,
    pub keys: String,
    pub description: String,
}

/// App info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub version: String,
    pub name: String,
    pub tauri_version: String,
}

/// Get full application configuration
#[tauri::command]
pub async fn get_config(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let config = state.config.read();
    serde_json::to_value(&*config).map_err(|e| e.to_string())
}

/// Update full application configuration
#[tauri::command]
pub async fn update_config(
    config: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let new_config: AppConfig = serde_json::from_value(config)
        .map_err(|e| e.to_string())?;
    
    {
        let mut conf = state.config.write();
        *conf = new_config;
    }
    
    // Save to disk
    state.config.read().save().map_err(|e| e.to_string())
}

/// Reset configuration to defaults
#[tauri::command]
pub async fn reset_config(
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut conf = state.config.write();
        *conf = AppConfig::default();
    }
    
    state.config.read().save().map_err(|e| e.to_string())
}

/// Get theme configuration
#[tauri::command]
pub async fn get_theme(
    state: State<'_, AppState>,
) -> Result<ThemeConfig, String> {
    let config = state.config.read();
    Ok(ThemeConfig {
        dark_mode: config.theme.dark_mode,
        accent_color: config.theme.accent_color.clone(),
        font_size: config.theme.font_size,
        compact: config.theme.compact,
    })
}

/// Update theme configuration
#[tauri::command]
pub async fn update_theme(
    theme: ThemeConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut config = state.config.write();
        config.theme.dark_mode = theme.dark_mode;
        config.theme.accent_color = theme.accent_color;
        config.theme.font_size = theme.font_size;
        config.theme.compact = theme.compact;
    }
    
    state.config.read().save().map_err(|e| e.to_string())
}

/// Get Kubernetes configuration
#[tauri::command]
pub async fn get_kubernetes_config(
    state: State<'_, AppState>,
) -> Result<KubernetesConfig, String> {
    let config = state.config.read();
    Ok(KubernetesConfig {
        default_namespace: config.kubernetes.default_namespace.clone(),
        kubeconfig_path: config.kubernetes.kubeconfig_path.as_ref().map(|p| p.to_string_lossy().to_string()),
        timeout_seconds: config.kubernetes.timeout_seconds,
        enable_watch: config.kubernetes.enable_watch,
        refresh_interval: config.kubernetes.refresh_interval,
    })
}

/// Update Kubernetes configuration
#[tauri::command]
pub async fn update_kubernetes_config(
    kubernetes: KubernetesConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut config = state.config.write();
        config.kubernetes.default_namespace = kubernetes.default_namespace;
        config.kubernetes.kubeconfig_path = kubernetes.kubeconfig_path.map(PathBuf::from);
        config.kubernetes.timeout_seconds = kubernetes.timeout_seconds;
        config.kubernetes.enable_watch = kubernetes.enable_watch;
        config.kubernetes.refresh_interval = kubernetes.refresh_interval;
    }
    
    state.config.read().save().map_err(|e| e.to_string())
}

/// Get cache configuration
#[tauri::command]
pub async fn get_cache_config(
    state: State<'_, AppState>,
) -> Result<CacheConfig, String> {
    let config = state.config.read();
    Ok(CacheConfig {
        enabled: config.cache.enabled,
        ttl_seconds: config.cache.ttl_seconds,
        max_entries: config.cache.max_entries,
    })
}

/// Update cache configuration
#[tauri::command]
pub async fn update_cache_config(
    cache: CacheConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut config = state.config.write();
        config.cache.enabled = cache.enabled;
        config.cache.ttl_seconds = cache.ttl_seconds;
        config.cache.max_entries = cache.max_entries;
    }
    
    state.config.read().save().map_err(|e| e.to_string())
}

/// Clear the resource cache
#[tauri::command]
pub async fn clear_cache(
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.cache.clear();
    Ok(())
}

/// Get plugin configuration
#[tauri::command]
pub async fn get_plugin_config(
    state: State<'_, AppState>,
) -> Result<PluginConfig, String> {
    let config = state.config.read();
    Ok(PluginConfig {
        kubectl_plugins: config.plugins.kubectl_plugins,
        plugin_dirs: config.plugins.plugin_dirs.iter().map(|p| p.to_string_lossy().to_string()).collect(),
        timeout_seconds: config.plugins.timeout_seconds,
        disabled: config.plugins.disabled.clone(),
    })
}

/// Update plugin configuration
#[tauri::command]
pub async fn update_plugin_config(
    plugins: PluginConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut config = state.config.write();
        config.plugins.kubectl_plugins = plugins.kubectl_plugins;
        config.plugins.plugin_dirs = plugins.plugin_dirs.into_iter().map(PathBuf::from).collect();
        config.plugins.timeout_seconds = plugins.timeout_seconds;
        config.plugins.disabled = plugins.disabled;
    }
    
    state.config.read().save().map_err(|e| e.to_string())
}

/// Get logging configuration
#[tauri::command]
pub async fn get_logging_config(
    state: State<'_, AppState>,
) -> Result<LoggingConfig, String> {
    let config = state.config.read();
    Ok(LoggingConfig {
        level: config.logging.level.clone(),
        file: config.logging.file.as_ref().map(|p| p.to_string_lossy().to_string()),
    })
}

/// Update logging configuration
#[tauri::command]
pub async fn update_logging_config(
    logging: LoggingConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut config = state.config.write();
        config.logging.level = logging.level;
        config.logging.file = logging.file.map(PathBuf::from);
    }
    
    state.config.read().save().map_err(|e| e.to_string())
}

/// Get keyboard shortcuts
#[tauri::command]
pub async fn get_keyboard_shortcuts(
    _state: State<'_, AppState>,
) -> Result<Vec<KeyboardShortcut>, String> {
    // Default keyboard shortcuts
    Ok(vec![
        KeyboardShortcut {
            id: "refresh".to_string(),
            action: "Refresh".to_string(),
            keys: "Cmd+R".to_string(),
            description: "Refresh current view".to_string(),
        },
        KeyboardShortcut {
            id: "search".to_string(),
            action: "Search".to_string(),
            keys: "Cmd+K".to_string(),
            description: "Open command palette".to_string(),
        },
        KeyboardShortcut {
            id: "delete".to_string(),
            action: "Delete".to_string(),
            keys: "Cmd+Backspace".to_string(),
            description: "Delete selected resource".to_string(),
        },
        KeyboardShortcut {
            id: "logs".to_string(),
            action: "View Logs".to_string(),
            keys: "Cmd+L".to_string(),
            description: "View logs for selected pod".to_string(),
        },
        KeyboardShortcut {
            id: "exec".to_string(),
            action: "Exec".to_string(),
            keys: "Cmd+E".to_string(),
            description: "Exec into selected pod".to_string(),
        },
    ])
}

/// Update a keyboard shortcut
#[tauri::command]
pub async fn update_keyboard_shortcut(
    shortcut: KeyboardShortcut,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    // Stub: would persist shortcut changes
    tracing::info!("Update shortcut: {} -> {}", shortcut.id, shortcut.keys);
    Ok(())
}

/// Reset keyboard shortcuts to defaults
#[tauri::command]
pub async fn reset_keyboard_shortcuts(
    _state: State<'_, AppState>,
) -> Result<(), String> {
    // Stub: would reset to defaults
    Ok(())
}

/// Export settings to JSON
#[tauri::command]
pub async fn export_settings(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let config = state.config.read();
    serde_json::to_string_pretty(&*config).map_err(|e| e.to_string())
}

/// Import settings from JSON
#[tauri::command]
pub async fn import_settings(
    json: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let new_config: AppConfig = serde_json::from_str(&json)
        .map_err(|e| e.to_string())?;
    
    {
        let mut conf = state.config.write();
        *conf = new_config;
    }
    
    state.config.read().save().map_err(|e| e.to_string())
}

/// Get application info
#[tauri::command]
pub async fn get_app_info() -> Result<AppInfo, String> {
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        name: "K8s GUI".to_string(),
        tauri_version: "2.1".to_string(),
    })
}
