//! Settings and configuration commands

use crate::config::{AppConfig, GcpProfile, AzureProfile, ContextBinding, CliPathsConfig};
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

// ============================================================================
// GCP Profiles
// ============================================================================

/// GCP profile info for listing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GcpProfileInfo {
    pub name: String,
    pub profile: GcpProfile,
}

/// List all GCP profiles
#[tauri::command]
pub fn list_gcp_profiles() -> Result<Vec<GcpProfileInfo>> {
    let config = AppConfig::load()?;
    Ok(config.cloud.gcp_profiles
        .into_iter()
        .map(|(name, profile)| GcpProfileInfo { name, profile })
        .collect())
}

/// Get a specific GCP profile
#[tauri::command]
pub fn get_gcp_profile(name: String) -> Result<Option<GcpProfile>> {
    let config = AppConfig::load()?;
    Ok(config.cloud.gcp_profiles.get(&name).cloned())
}

/// Save a GCP profile (create or update)
#[tauri::command]
pub fn save_gcp_profile(name: String, profile: GcpProfile) -> Result<()> {
    let mut config = AppConfig::load()?;
    
    // Filter empty strings
    let cleaned_profile = GcpProfile {
        description: profile.description.filter(|s| !s.is_empty()),
        service_account_key_path: profile.service_account_key_path.filter(|s| !s.is_empty()),
        gcloud_path: profile.gcloud_path.filter(|s| !s.is_empty()),
        default_project: profile.default_project.filter(|s| !s.is_empty()),
        prefer_native_auth: profile.prefer_native_auth,
    };
    
    config.cloud.gcp_profiles.insert(name, cleaned_profile);
    save_config(&config)
}

/// Delete a GCP profile
#[tauri::command]
pub fn delete_gcp_profile(name: String) -> Result<()> {
    let mut config = AppConfig::load()?;
    config.cloud.gcp_profiles.remove(&name);
    
    // Also remove any context bindings using this profile
    for binding in config.cloud.context_bindings.values_mut() {
        if binding.gcp_profile.as_ref() == Some(&name) {
            binding.gcp_profile = None;
        }
    }
    
    save_config(&config)
}

/// Test GCP profile authentication
#[tauri::command]
pub async fn test_gcp_profile(name: String) -> Result<String> {
    use crate::auth::{AuthProvider, GcpGkeAuth};
    
    let config = AppConfig::load()?;
    let profile = config.cloud.gcp_profiles.get(&name);
    
    let service_account_path = profile
        .and_then(|p| p.service_account_key_path.clone())
        .map(std::path::PathBuf::from);
    
    let auth = GcpGkeAuth::new(service_account_path);
    
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

// ============================================================================
// Azure Profiles
// ============================================================================

/// Azure profile info for listing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureProfileInfo {
    pub name: String,
    pub profile: AzureProfile,
}

/// List all Azure profiles
#[tauri::command]
pub fn list_azure_profiles() -> Result<Vec<AzureProfileInfo>> {
    let config = AppConfig::load()?;
    Ok(config.cloud.azure_profiles
        .into_iter()
        .map(|(name, profile)| AzureProfileInfo { name, profile })
        .collect())
}

/// Get a specific Azure profile
#[tauri::command]
pub fn get_azure_profile(name: String) -> Result<Option<AzureProfile>> {
    let config = AppConfig::load()?;
    Ok(config.cloud.azure_profiles.get(&name).cloned())
}

/// Save an Azure profile (create or update)
#[tauri::command]
pub fn save_azure_profile(name: String, profile: AzureProfile) -> Result<()> {
    let mut config = AppConfig::load()?;
    
    // Filter empty strings
    let cleaned_profile = AzureProfile {
        description: profile.description.filter(|s| !s.is_empty()),
        az_path: profile.az_path.filter(|s| !s.is_empty()),
        kubelogin_path: profile.kubelogin_path.filter(|s| !s.is_empty()),
        default_subscription: profile.default_subscription.filter(|s| !s.is_empty()),
        tenant_id: profile.tenant_id.filter(|s| !s.is_empty()),
        use_cli_fallback: profile.use_cli_fallback,
        prefer_native_auth: profile.prefer_native_auth,
    };
    
    config.cloud.azure_profiles.insert(name, cleaned_profile);
    save_config(&config)
}

/// Delete an Azure profile
#[tauri::command]
pub fn delete_azure_profile(name: String) -> Result<()> {
    let mut config = AppConfig::load()?;
    config.cloud.azure_profiles.remove(&name);
    
    // Also remove any context bindings using this profile
    for binding in config.cloud.context_bindings.values_mut() {
        if binding.azure_profile.as_ref() == Some(&name) {
            binding.azure_profile = None;
        }
    }
    
    save_config(&config)
}

/// Test Azure profile authentication
#[tauri::command]
pub async fn test_azure_profile(name: String) -> Result<String> {
    use crate::auth::{AuthProvider, AzureAksAuth};
    
    let config = AppConfig::load()?;
    let profile = config.cloud.azure_profiles.get(&name);
    
    let (use_cli_fallback, tenant_id) = profile
        .map(|p| (p.use_cli_fallback, p.tenant_id.clone()))
        .unwrap_or((false, None));
    
    let auth = AzureAksAuth::new(use_cli_fallback, tenant_id);
    
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

// ============================================================================
// Context Bindings
// ============================================================================

/// Context binding info for listing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextBindingInfo {
    pub context_name: String,
    pub gcp_profile: Option<String>,
    pub azure_profile: Option<String>,
}

/// List all context bindings
#[tauri::command]
pub fn list_context_bindings() -> Result<Vec<ContextBindingInfo>> {
    let config = AppConfig::load()?;
    Ok(config.cloud.context_bindings
        .into_iter()
        .map(|(context_name, binding)| ContextBindingInfo {
            context_name,
            gcp_profile: binding.gcp_profile,
            azure_profile: binding.azure_profile,
        })
        .collect())
}

/// Get binding for a specific context
#[tauri::command]
pub fn get_context_binding(context: String) -> Result<ContextBinding> {
    let config = AppConfig::load()?;
    Ok(config.cloud.context_bindings
        .get(&context)
        .cloned()
        .unwrap_or_default())
}

/// Save context binding
#[tauri::command]
pub fn save_context_binding(context: String, binding: ContextBinding) -> Result<()> {
    let mut config = AppConfig::load()?;
    
    // If both profiles are None, remove the binding entirely
    if binding.gcp_profile.is_none() && binding.azure_profile.is_none() {
        config.cloud.context_bindings.remove(&context);
    } else {
        config.cloud.context_bindings.insert(context, binding);
    }
    
    save_config(&config)
}

/// Delete context binding
#[tauri::command]
pub fn delete_context_binding(context: String) -> Result<()> {
    let mut config = AppConfig::load()?;
    config.cloud.context_bindings.remove(&context);
    save_config(&config)
}

// ============================================================================
// CLI Paths
// ============================================================================

/// Get CLI paths configuration
#[tauri::command]
pub fn get_cli_paths() -> Result<CliPathsConfig> {
    let config = AppConfig::load()?;
    Ok(config.cli_paths)
}

/// Save CLI paths configuration
#[tauri::command]
pub fn save_cli_paths(cli_paths: CliPathsConfig) -> Result<()> {
    let mut config = AppConfig::load()?;
    
    // Filter empty strings
    let cleaned = CliPathsConfig {
        helm_path: cli_paths.helm_path.filter(|s| !s.is_empty()),
    };
    
    config.cli_paths = cleaned;
    save_config(&config)
}

// ============================================================================
// Helper functions
// ============================================================================

pub fn save_config(config: &AppConfig) -> Result<()> {
    use crate::error::Error;
    
    let config_path = AppConfig::config_path()?;
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| Error::Config(format!("Failed to create config directory: {e}")))?;
    }
    
    let toml_str = toml::to_string_pretty(config)
        .map_err(|e| Error::Config(format!("Failed to serialize config: {e}")))?;
    
    std::fs::write(&config_path, toml_str)
        .map_err(|e| Error::Config(format!("Failed to write config file: {e}")))?;
    
    Ok(())
}
