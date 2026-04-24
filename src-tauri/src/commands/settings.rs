//! Settings and configuration commands

use crate::config::{
    AppConfig, AzureProfile, CliPathsConfig, ClusterPreferences, ContextBinding, GcpProfile,
    RecentItem,
};
use crate::error::Result;
use serde::{Deserialize, Serialize};

/// Theme configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeConfig {
    pub theme: String,
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
    read_config(|config| {
        config
            .cloud
            .gcp_profiles
            .iter()
            .map(|(name, profile)| GcpProfileInfo {
                name: name.clone(),
                profile: profile.clone(),
            })
            .collect()
    })
}

/// Get a specific GCP profile
#[tauri::command]
pub fn get_gcp_profile(name: String) -> Result<Option<GcpProfile>> {
    read_config(|config| config.cloud.gcp_profiles.get(&name).cloned())
}

/// Save a GCP profile (create or update)
#[tauri::command]
pub fn save_gcp_profile(name: String, profile: GcpProfile) -> Result<()> {
    with_config(|config| {
        config
            .cloud
            .gcp_profiles
            .insert(name, profile.clean_empty_strings());
    })
}

/// Delete a GCP profile
#[tauri::command]
pub fn delete_gcp_profile(name: String) -> Result<()> {
    with_config(|config| {
        config.cloud.gcp_profiles.remove(&name);
        // Also remove any context bindings using this profile
        for binding in config.cloud.context_bindings.values_mut() {
            if binding.gcp_profile.as_ref() == Some(&name) {
                binding.gcp_profile = None;
            }
        }
    })
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
            let expires = result
                .expires_at
                .map(|t| t.format("%Y-%m-%d %H:%M:%S UTC").to_string())
                .unwrap_or_else(|| "unknown".to_string());
            Ok(format!(
                "Authentication successful! Token expires: {}",
                expires
            ))
        }
        Err(e) => Ok(format!("Authentication failed: {}", e)),
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
    read_config(|config| {
        config
            .cloud
            .azure_profiles
            .iter()
            .map(|(name, profile)| AzureProfileInfo {
                name: name.clone(),
                profile: profile.clone(),
            })
            .collect()
    })
}

/// Get a specific Azure profile
#[tauri::command]
pub fn get_azure_profile(name: String) -> Result<Option<AzureProfile>> {
    read_config(|config| config.cloud.azure_profiles.get(&name).cloned())
}

/// Save an Azure profile (create or update)
#[tauri::command]
pub fn save_azure_profile(name: String, profile: AzureProfile) -> Result<()> {
    with_config(|config| {
        config
            .cloud
            .azure_profiles
            .insert(name, profile.clean_empty_strings());
    })
}

/// Delete an Azure profile
#[tauri::command]
pub fn delete_azure_profile(name: String) -> Result<()> {
    with_config(|config| {
        config.cloud.azure_profiles.remove(&name);
        // Also remove any context bindings using this profile
        for binding in config.cloud.context_bindings.values_mut() {
            if binding.azure_profile.as_ref() == Some(&name) {
                binding.azure_profile = None;
            }
        }
    })
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
            let expires = result
                .expires_at
                .map(|t| t.format("%Y-%m-%d %H:%M:%S UTC").to_string())
                .unwrap_or_else(|| "unknown".to_string());
            Ok(format!(
                "Authentication successful! Token expires: {}",
                expires
            ))
        }
        Err(e) => Ok(format!("Authentication failed: {}", e)),
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
    read_config(|config| {
        config
            .cloud
            .context_bindings
            .iter()
            .map(|(context_name, binding)| ContextBindingInfo {
                context_name: context_name.clone(),
                gcp_profile: binding.gcp_profile.clone(),
                azure_profile: binding.azure_profile.clone(),
            })
            .collect()
    })
}

/// Get binding for a specific context
#[tauri::command]
pub fn get_context_binding(context: String) -> Result<ContextBinding> {
    read_config(|config| {
        config
            .cloud
            .context_bindings
            .get(&context)
            .cloned()
            .unwrap_or_default()
    })
}

/// Save context binding
#[tauri::command]
pub fn save_context_binding(context: String, binding: ContextBinding) -> Result<()> {
    with_config(|config| {
        // If both profiles are None, remove the binding entirely
        if binding.gcp_profile.is_none() && binding.azure_profile.is_none() {
            config.cloud.context_bindings.remove(&context);
        } else {
            config.cloud.context_bindings.insert(context, binding);
        }
    })
}

/// Delete context binding
#[tauri::command]
pub fn delete_context_binding(context: String) -> Result<()> {
    with_config(|config| {
        config.cloud.context_bindings.remove(&context);
    })
}

// ============================================================================
// CLI Paths
// ============================================================================

/// Get CLI paths configuration
#[tauri::command]
pub fn get_cli_paths() -> Result<CliPathsConfig> {
    read_config(|config| config.cli_paths.clone())
}

/// Save CLI paths configuration
#[tauri::command]
pub async fn save_cli_paths(cli_paths: CliPathsConfig) -> Result<()> {
    // Filter empty strings
    let cleaned = CliPathsConfig {
        helm_path: cli_paths.helm_path.filter(|s| !s.is_empty()),
        kubectl_path: cli_paths.kubectl_path.filter(|s| !s.is_empty()),
    };

    with_config(|config| {
        config.cli_paths = cleaned;
    })?;

    // Reload CLI managers with new configuration
    // This ensures the managers pick up the updated custom paths immediately
    crate::commands::kubectl::reload_kubectl_manager().await;
    crate::commands::helm::reload_helm_manager().await;

    Ok(())
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

/// Execute a modification on the config and save it automatically.
/// Reduces boilerplate for load -> modify -> save pattern.
pub fn with_config<F>(f: F) -> Result<()>
where
    F: FnOnce(&mut AppConfig),
{
    let mut config = AppConfig::load()?;
    f(&mut config);
    save_config(&config)
}

/// Execute a read operation on the config.
/// Reduces boilerplate for load -> read pattern.
pub fn read_config<F, T>(f: F) -> Result<T>
where
    F: FnOnce(&AppConfig) -> T,
{
    let config = AppConfig::load()?;
    Ok(f(&config))
}

// ============================================================================
// Registry Configurations
// ============================================================================

use crate::config::{
    InfrastructureBuilderState as ConfigBuilderState, RegistryConfigEntry, YamlHistoryEntry,
};

/// Registry config info for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryConfigInfo {
    pub id: String,
    pub label: String,
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    // Credentials
    pub auth_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

/// List all registry configurations
#[tauri::command]
pub fn list_registry_configs() -> Result<Vec<RegistryConfigInfo>> {
    read_config(|config| {
        config
            .registries
            .registries
            .iter()
            .map(|(id, entry)| RegistryConfigInfo {
                id: id.clone(),
                label: entry.label.clone(),
                provider: entry.provider.clone(),
                base_url: entry.base_url.clone(),
                host: entry.host.clone(),
                project: entry.project.clone(),
                account_id: entry.account_id.clone(),
                region: entry.region.clone(),
                auth_type: entry.auth_type.clone(),
                username: entry.username.clone(),
                password: None, // Don't expose password in list
                token: None,    // Don't expose token in list
            })
            .collect()
    })
}

/// Save a registry configuration
#[tauri::command]
pub fn save_registry_config(id: String, config_entry: RegistryConfigInfo) -> Result<()> {
    let mut config = AppConfig::load()?;

    // Preserve existing credentials if not provided
    let existing = config.registries.registries.get(&id);
    let (auth_type, username, password, token) = if config_entry.auth_type == "none" {
        ("none".to_string(), None, None, None)
    } else {
        (
            config_entry.auth_type,
            config_entry.username.filter(|s| !s.is_empty()),
            config_entry
                .password
                .filter(|s| !s.is_empty())
                .or_else(|| existing.and_then(|e| e.password.clone())),
            config_entry
                .token
                .filter(|s| !s.is_empty())
                .or_else(|| existing.and_then(|e| e.token.clone())),
        )
    };

    let entry = RegistryConfigEntry {
        label: config_entry.label,
        provider: config_entry.provider,
        base_url: config_entry.base_url.filter(|s| !s.is_empty()),
        host: config_entry.host.filter(|s| !s.is_empty()),
        project: config_entry.project.filter(|s| !s.is_empty()),
        account_id: config_entry.account_id.filter(|s| !s.is_empty()),
        region: config_entry.region.filter(|s| !s.is_empty()),
        auth_type,
        username,
        password,
        token,
    };

    config.registries.registries.insert(id, entry);
    save_config(&config)
}

/// Delete a registry configuration
#[tauri::command]
pub fn delete_registry_config(id: String) -> Result<()> {
    with_config(|config| {
        config.registries.registries.remove(&id);
    })
}

// ============================================================================
// Theme Configuration
// ============================================================================

/// Get theme configuration
#[tauri::command]
pub fn get_theme_config() -> Result<ThemeConfig> {
    read_config(|config| ThemeConfig {
        theme: config.theme.theme.clone(),
        accent_color: config.theme.accent_color.clone(),
        font_size: config.theme.font_size,
        compact: config.theme.compact,
    })
}

/// Save theme configuration
#[tauri::command]
pub fn save_theme_config(theme: ThemeConfig) -> Result<()> {
    with_config(|config| {
        config.theme.theme = theme.theme;
        config.theme.accent_color = theme.accent_color;
        config.theme.font_size = theme.font_size;
        config.theme.compact = theme.compact;
    })
}

// ============================================================================
// YAML Editor History
// ============================================================================

/// YAML history entry for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YamlHistoryEntryDto {
    pub timestamp: i64,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Get YAML history for a resource
#[tauri::command]
pub fn get_yaml_history(resource_key: String) -> Result<Vec<YamlHistoryEntryDto>> {
    read_config(|config| {
        config
            .yaml_editor
            .history
            .get(&resource_key)
            .map(|entries| {
                entries
                    .iter()
                    .map(|e| YamlHistoryEntryDto {
                        timestamp: e.timestamp,
                        content: e.content.clone(),
                        label: e.label.clone(),
                    })
                    .collect()
            })
            .unwrap_or_default()
    })
}

/// Add a YAML history entry
#[tauri::command]
pub fn add_yaml_history_entry(resource_key: String, entry: YamlHistoryEntryDto) -> Result<()> {
    let history_entry = YamlHistoryEntry {
        timestamp: entry.timestamp,
        content: entry.content,
        label: entry.label,
    };

    with_config(|config| {
        let entries = config.yaml_editor.history.entry(resource_key).or_default();
        // Add to front, limit to 20 entries
        entries.insert(0, history_entry);
        entries.truncate(20);
    })
}

/// Get all YAML history
#[tauri::command]
pub fn get_all_yaml_history() -> Result<std::collections::HashMap<String, Vec<YamlHistoryEntryDto>>>
{
    read_config(|config| {
        config
            .yaml_editor
            .history
            .iter()
            .map(|(k, v)| {
                let entries = v
                    .iter()
                    .map(|e| YamlHistoryEntryDto {
                        timestamp: e.timestamp,
                        content: e.content.clone(),
                        label: e.label.clone(),
                    })
                    .collect();
                (k.clone(), entries)
            })
            .collect()
    })
}

// ============================================================================
// Infrastructure Builder State
// ============================================================================

/// Infrastructure builder state for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InfrastructureBuilderStateDto {
    pub nodes: Vec<serde_json::Value>,
    pub edges: Vec<serde_json::Value>,
    pub yaml_text: String,
    pub extra_manifests: Vec<serde_json::Value>,
}

/// Get infrastructure builder state for a context
#[tauri::command]
pub fn get_infrastructure_state(context: String) -> Result<InfrastructureBuilderStateDto> {
    read_config(|config| {
        let state = config
            .infrastructure_builder
            .contexts
            .get(&context)
            .cloned()
            .unwrap_or_default();
        InfrastructureBuilderStateDto {
            nodes: state.nodes,
            edges: state.edges,
            yaml_text: state.yaml_text,
            extra_manifests: state.extra_manifests,
        }
    })
}

/// Save infrastructure builder state for a context
#[tauri::command]
pub fn save_infrastructure_state(
    context: String,
    state: InfrastructureBuilderStateDto,
) -> Result<()> {
    let builder_state = ConfigBuilderState {
        nodes: state.nodes,
        edges: state.edges,
        yaml_text: state.yaml_text,
        extra_manifests: state.extra_manifests,
    };

    with_config(|config| {
        config
            .infrastructure_builder
            .contexts
            .insert(context, builder_state);
    })
}

/// Clear infrastructure builder state for a context
#[tauri::command]
pub fn clear_infrastructure_state(context: String) -> Result<()> {
    with_config(|config| {
        config.infrastructure_builder.contexts.remove(&context);
    })
}

// ============================================================================
// Recent Items (Command Palette)
// ============================================================================

/// Get recent items
#[tauri::command]
pub fn get_recent_items() -> Result<Vec<RecentItem>> {
    read_config(|config| config.recent_items.items.clone())
}

/// Add a recent item
#[tauri::command]
pub fn add_recent_item(item: RecentItem) -> Result<()> {
    with_config(|config| {
        config.recent_items.add_item(item);
    })
}

// ============================================================================
// Updater Settings
// ============================================================================

use crate::config::UpdaterConfig;

/// Get updater settings
#[tauri::command]
pub fn get_updater_settings() -> Result<UpdaterConfig> {
    read_config(|config| config.updater.clone())
}

/// Save updater settings
#[tauri::command]
pub fn save_updater_settings(settings: UpdaterConfig) -> Result<()> {
    with_config(|config| {
        config.updater = settings;
    })
}

// ============================================================================
// Cluster Preferences
// ============================================================================

/// Get cluster preferences
#[tauri::command]
pub fn get_cluster_preferences() -> Result<ClusterPreferences> {
    read_config(|config| config.cluster_preferences.clone())
}

/// Save cluster preferences
#[tauri::command]
pub fn save_cluster_preferences(
    last_context: Option<String>,
    context: Option<String>,
    namespace: Option<String>,
) -> Result<()> {
    with_config(|config| {
        if let Some(ctx) = last_context {
            config.cluster_preferences.last_context = Some(ctx);
        }

        if let (Some(ctx), Some(ns)) = (context, namespace) {
            config.cluster_preferences.namespaces.insert(ctx, ns);
        }
    })
}
