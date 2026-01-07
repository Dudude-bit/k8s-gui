//! Settings and configuration commands

use crate::config::AppConfig;
use crate::error::Result;
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

/// Get application version and build info
#[tauri::command]
pub fn get_app_info(app: tauri::AppHandle) -> AppInfo {
    let package_info = app.package_info();
    AppInfo {
        version: package_info.version.to_string(),
        name: package_info.name.to_string(),
        tauri_version: tauri::VERSION.to_string(),
    }
}

/// Clear the resource cache
#[tauri::command]
pub fn clear_cache(state: State<'_, AppState>) -> Result<()> {
    state.cache.clear();
    Ok(())
}

/// GCP cloud configuration for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GcpCloudConfig {
    /// Path to service account JSON key file
    pub service_account_key_path: Option<String>,
    /// Custom path to gcloud CLI binary
    pub gcloud_path: Option<String>,
    /// Default GCP project ID
    pub default_project: Option<String>,
    /// Prefer native SDK auth over exec plugin
    pub prefer_native_auth: bool,
}

/// Azure cloud configuration for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureCloudConfig {
    /// Custom path to az CLI binary
    pub az_path: Option<String>,
    /// Custom path to kubelogin binary
    pub kubelogin_path: Option<String>,
    /// Default Azure subscription ID
    pub default_subscription: Option<String>,
    /// Default Azure tenant ID
    pub tenant_id: Option<String>,
    /// Use Azure CLI credentials as fallback
    pub use_cli_fallback: bool,
    /// Prefer native SDK auth over exec plugin
    pub prefer_native_auth: bool,
}

/// Combined cloud configuration for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudConfig {
    pub gcp: GcpCloudConfig,
    pub azure: AzureCloudConfig,
}

/// Get cloud provider configuration
#[tauri::command]
pub fn get_cloud_config() -> Result<CloudConfig> {
    let config = AppConfig::load()?;
    
    Ok(CloudConfig {
        gcp: GcpCloudConfig {
            service_account_key_path: config.cloud.gcp.service_account_key_path
                .map(|p| p.to_string_lossy().to_string()),
            gcloud_path: config.cloud.gcp.gcloud_path
                .map(|p| p.to_string_lossy().to_string()),
            default_project: config.cloud.gcp.default_project,
            prefer_native_auth: config.cloud.gcp.prefer_native_auth,
        },
        azure: AzureCloudConfig {
            az_path: config.cloud.azure.az_path
                .map(|p| p.to_string_lossy().to_string()),
            kubelogin_path: config.cloud.azure.kubelogin_path
                .map(|p| p.to_string_lossy().to_string()),
            default_subscription: config.cloud.azure.default_subscription,
            tenant_id: config.cloud.azure.tenant_id,
            use_cli_fallback: config.cloud.azure.use_cli_fallback,
            prefer_native_auth: config.cloud.azure.prefer_native_auth,
        },
    })
}

/// Save cloud provider configuration
#[tauri::command]
pub fn save_cloud_config(config: CloudConfig) -> Result<()> {
    use crate::error::Error;
    use std::path::PathBuf;

    let mut app_config = AppConfig::load()?;
    
    // Update GCP config
    app_config.cloud.gcp.service_account_key_path = config.gcp.service_account_key_path
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    app_config.cloud.gcp.gcloud_path = config.gcp.gcloud_path
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    app_config.cloud.gcp.default_project = config.gcp.default_project
        .filter(|s| !s.is_empty());
    app_config.cloud.gcp.prefer_native_auth = config.gcp.prefer_native_auth;
    
    // Update Azure config
    app_config.cloud.azure.az_path = config.azure.az_path
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    app_config.cloud.azure.kubelogin_path = config.azure.kubelogin_path
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    app_config.cloud.azure.default_subscription = config.azure.default_subscription
        .filter(|s| !s.is_empty());
    app_config.cloud.azure.tenant_id = config.azure.tenant_id
        .filter(|s| !s.is_empty());
    app_config.cloud.azure.use_cli_fallback = config.azure.use_cli_fallback;
    app_config.cloud.azure.prefer_native_auth = config.azure.prefer_native_auth;
    
    // Save config
    let config_path = AppConfig::config_path()?;
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| Error::Config(format!("Failed to create config directory: {e}")))?;
    }
    
    let toml_str = toml::to_string_pretty(&app_config)
        .map_err(|e| Error::Config(format!("Failed to serialize config: {e}")))?;
    
    std::fs::write(&config_path, toml_str)
        .map_err(|e| Error::Config(format!("Failed to write config file: {e}")))?;
    
    Ok(())
}

/// Test GCP authentication
#[tauri::command]
pub async fn test_gcp_auth() -> Result<String> {
    use crate::auth::{AuthProvider, GcpGkeAuth};
    
    let config = AppConfig::load()?;
    let auth = GcpGkeAuth::new(config.cloud.gcp.service_account_key_path);
    
    match auth.authenticate().await {
        Ok(result) => {
            let expires = result.expires_at
                .map(|t| t.format("%Y-%m-%d %H:%M:%S UTC").to_string())
                .unwrap_or_else(|| "unknown".to_string());
            Ok(format!("Authentication successful! Token expires: {}", expires))
        }
        Err(e) => Ok(format!("Authentication failed: {}", e))
    }
}

/// Test Azure authentication
#[tauri::command]
pub async fn test_azure_auth() -> Result<String> {
    use crate::auth::{AuthProvider, AzureAksAuth};
    
    let config = AppConfig::load()?;
    let auth = AzureAksAuth::new(
        config.cloud.azure.use_cli_fallback,
        config.cloud.azure.tenant_id,
    );
    
    match auth.authenticate().await {
        Ok(result) => {
            let expires = result.expires_at
                .map(|t| t.format("%Y-%m-%d %H:%M:%S UTC").to_string())
                .unwrap_or_else(|| "unknown".to_string());
            Ok(format!("Authentication successful! Token expires: {}", expires))
        }
        Err(e) => Ok(format!("Authentication failed: {}", e))
    }
}
