//! Application configuration
//!
//! This module provides configuration management for the K8s GUI application.
//! Configuration is loaded from TOML files with sensible defaults.

use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Application configuration
///
/// Contains all application settings including theme, Kubernetes connection,
/// cache, plugins, and logging configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    /// UI theme
    pub theme: ThemeConfig,
    /// Kubernetes configuration
    pub kubernetes: KubernetesConfig,
    /// Cache configuration
    pub cache: CacheConfig,
    /// Plugin configuration
    pub plugins: PluginsConfig,
    /// Logging configuration
    pub logging: LoggingConfig,
    /// Cloud provider configuration
    #[serde(default)]
    pub cloud: CloudConfig,
    /// Registry credentials
    #[serde(default)]
    pub registry_credentials: RegistryCredentialsConfig,
    /// Authentication tokens (license server)
    #[serde(default)]
    pub auth_tokens: AuthTokensConfig,
    /// Port-forward configuration
    #[serde(default)]
    pub port_forward: PortForwardConfigStore,
    /// CLI tools paths
    #[serde(default)]
    pub cli_paths: CliPathsConfig,
}

/// Theme configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeConfig {
    /// Dark mode enabled
    #[serde(default = "default_dark_mode")]
    pub dark_mode: bool,
    /// Accent color
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
    /// Font size
    #[serde(default = "default_font_size")]
    pub font_size: u8,
    /// Compact mode
    #[serde(default)]
    pub compact: bool,
}

fn default_dark_mode() -> bool {
    true
}
fn default_accent_color() -> String {
    "#3b82f6".to_string()
}
fn default_font_size() -> u8 {
    14
}

impl Default for ThemeConfig {
    fn default() -> Self {
        Self {
            dark_mode: default_dark_mode(),
            accent_color: default_accent_color(),
            font_size: default_font_size(),
            compact: false,
        }
    }
}

/// Kubernetes configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KubernetesConfig {
    /// Default kubeconfig path
    pub kubeconfig_path: Option<PathBuf>,
    /// Default namespace
    #[serde(default = "default_namespace")]
    pub default_namespace: String,
    /// Request timeout in seconds
    #[serde(default = "default_timeout")]
    pub timeout_seconds: u64,
    /// Enable watch functionality
    #[serde(default = "default_true")]
    pub enable_watch: bool,
    /// Refresh interval in seconds
    #[serde(default = "default_refresh_interval")]
    pub refresh_interval: u64,
}

fn default_namespace() -> String {
    "default".to_string()
}
fn default_timeout() -> u64 {
    30
}
fn default_true() -> bool {
    true
}
fn default_refresh_interval() -> u64 {
    30
}

impl Default for KubernetesConfig {
    fn default() -> Self {
        Self {
            kubeconfig_path: None,
            default_namespace: default_namespace(),
            timeout_seconds: default_timeout(),
            enable_watch: true,
            refresh_interval: default_refresh_interval(),
        }
    }
}

/// Cache configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheConfig {
    /// Enable caching
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Cache TTL in seconds
    #[serde(default = "default_cache_ttl")]
    pub ttl_seconds: u64,
    /// Maximum cache entries
    #[serde(default = "default_max_entries")]
    pub max_entries: usize,
}

fn default_cache_ttl() -> u64 {
    60
}
fn default_max_entries() -> usize {
    1000
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            ttl_seconds: default_cache_ttl(),
            max_entries: default_max_entries(),
        }
    }
}

/// Plugin configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginsConfig {
    /// Enable kubectl plugins
    #[serde(default = "default_true")]
    pub kubectl_plugins: bool,
    /// Additional plugin directories
    #[serde(default)]
    pub plugin_dirs: Vec<PathBuf>,
    /// Plugin execution timeout in seconds
    #[serde(default = "default_plugin_timeout")]
    pub timeout_seconds: u64,
    /// Disabled plugins
    #[serde(default)]
    pub disabled: Vec<String>,
}

fn default_plugin_timeout() -> u64 {
    60
}

impl Default for PluginsConfig {
    fn default() -> Self {
        Self {
            kubectl_plugins: true,
            plugin_dirs: vec![],
            timeout_seconds: default_plugin_timeout(),
            disabled: vec![],
        }
    }
}

/// Logging configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    /// Log level
    #[serde(default = "default_log_level")]
    pub level: String,
    /// Log to file
    #[serde(default)]
    pub file: Option<PathBuf>,
    /// Max log file size in MB
    #[serde(default = "default_log_size")]
    pub max_size_mb: u64,
}

fn default_log_level() -> String {
    "info".to_string()
}
fn default_log_size() -> u64 {
    10
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: default_log_level(),
            file: None,
            max_size_mb: default_log_size(),
        }
    }
}

/// Cloud provider configuration
///
/// Settings for GCP, Azure, and other cloud provider authentication using profiles.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CloudConfig {
    /// GCP profiles (key = profile name)
    #[serde(default, alias = "gcp_profiles")]
    pub gcp_profiles: std::collections::HashMap<String, GcpProfile>,
    /// Azure profiles (key = profile name)
    #[serde(default, alias = "azure_profiles")]
    pub azure_profiles: std::collections::HashMap<String, AzureProfile>,
    /// Context to profile bindings (key = kubeconfig context name)
    #[serde(default, alias = "context_bindings")]
    pub context_bindings: std::collections::HashMap<String, ContextBinding>,
}

/// Registry credentials configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RegistryCredentialsConfig {
    /// Registry credentials (key = registry ID)
    #[serde(default)]
    pub registries: std::collections::HashMap<String, RegistryCredential>,
}

/// Stored registry credential
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryCredential {
    /// Auth type (basic, token, none)
    #[serde(alias = "auth_type")]
    pub auth_type: String,
    /// Username for basic auth
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    /// Password for basic auth (stored in plain text - consider using keyring for sensitive data)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    /// Token for token auth
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

/// Authentication tokens configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuthTokensConfig {
    /// Access token for license server
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "access_token")]
    pub access_token: Option<String>,
    /// Refresh token for license server
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "refresh_token")]
    pub refresh_token: Option<String>,
}

/// CLI tools paths configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CliPathsConfig {
    /// Custom path to helm binary (if not in PATH)
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "helm_path")]
    pub helm_path: Option<String>,
}

/// Port-forward configuration store
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PortForwardConfigStore {
    /// Saved port-forward configs
    #[serde(default)]
    pub configs: Vec<PortForwardConfig>,
}

/// Stored port-forward configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortForwardConfig {
    pub id: String,
    pub context: String,
    pub name: String,
    pub pod: String,
    pub namespace: String,
    pub local_port: u16,
    pub remote_port: u16,
    #[serde(default)]
    pub auto_reconnect: bool,
    #[serde(default)]
    pub auto_start: bool,
    pub created_at: String,
}

/// Binding of a kubeconfig context to cloud profiles
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContextBinding {
    /// GCP profile name for this context (None = use ADC)
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "gcp_profile")]
    pub gcp_profile: Option<String>,
    /// Azure profile name for this context (None = use default az login)
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "azure_profile")]
    pub azure_profile: Option<String>,
}

/// GCP authentication profile
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GcpProfile {
    /// Human-readable description
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Path to service account JSON key file (optional)
    /// If not set, uses Application Default Credentials
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "service_account_key_path")]
    pub service_account_key_path: Option<String>,
    /// Custom path to gcloud CLI binary (for exec fallback)
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "gcloud_path")]
    pub gcloud_path: Option<String>,
    /// Default GCP project ID
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "default_project")]
    pub default_project: Option<String>,
    /// Prefer native SDK auth over exec plugin
    #[serde(default = "default_true", alias = "prefer_native_auth")]
    pub prefer_native_auth: bool,
}

impl Default for GcpProfile {
    fn default() -> Self {
        Self {
            description: None,
            service_account_key_path: None,
            gcloud_path: None,
            default_project: None,
            prefer_native_auth: true,
        }
    }
}

/// Azure authentication profile
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureProfile {
    /// Human-readable description
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Custom path to az CLI binary (for exec fallback)
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "az_path")]
    pub az_path: Option<String>,
    /// Custom path to kubelogin binary (for exec fallback)
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "kubelogin_path")]
    pub kubelogin_path: Option<String>,
    /// Default Azure subscription ID
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "default_subscription")]
    pub default_subscription: Option<String>,
    /// Azure tenant ID
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "tenant_id")]
    pub tenant_id: Option<String>,
    /// Use Azure CLI credentials as fallback when SDK auth fails
    #[serde(default, alias = "use_cli_fallback")]
    pub use_cli_fallback: bool,
    /// Prefer native SDK auth over exec plugin
    #[serde(default = "default_true", alias = "prefer_native_auth")]
    pub prefer_native_auth: bool,
}

impl Default for AzureProfile {
    fn default() -> Self {
        Self {
            description: None,
            az_path: None,
            kubelogin_path: None,
            default_subscription: None,
            tenant_id: None,
            use_cli_fallback: false,
            prefer_native_auth: true,
        }
    }
}

impl CloudConfig {
    /// Get GCP profile for a context
    /// Returns the profile if bound, or None to use ADC
    pub fn get_gcp_profile_for_context(&self, context: &str) -> Option<&GcpProfile> {
        self.context_bindings
            .get(context)
            .and_then(|binding| binding.gcp_profile.as_ref())
            .and_then(|profile_name| self.gcp_profiles.get(profile_name))
    }

    /// Get Azure profile for a context
    /// Returns the profile if bound, or None to use default az login
    pub fn get_azure_profile_for_context(&self, context: &str) -> Option<&AzureProfile> {
        self.context_bindings
            .get(context)
            .and_then(|binding| binding.azure_profile.as_ref())
            .and_then(|profile_name| self.azure_profiles.get(profile_name))
    }
}

impl AppConfig {
    /// Load configuration from file
    ///
    /// Attempts to load configuration from the default config file location.
    /// If the file doesn't exist, returns the default configuration.
    ///
    /// # Returns
    ///
    /// Returns the loaded configuration or default configuration if file doesn't exist.
    ///
    /// # Errors
    ///
    /// Returns `Error::Config` if:
    /// - Config directory cannot be determined
    /// - Config file cannot be read
    /// - Config file contains invalid TOML
    pub fn load() -> Result<Self> {
        let config_path = Self::config_path()?;

        if config_path.exists() {
            let content = std::fs::read_to_string(&config_path)
                .map_err(|e| Error::Config(format!("Failed to read config: {e}")))?;

            let config: Self = toml::from_str(&content)
                .map_err(|e| Error::Config(format!("Failed to parse config: {e}")))?;

            Ok(config)
        } else {
            // Return default config
            Ok(Self::default())
        }
    }

    /// Get the configuration file path
    ///
    /// Returns the default path where the configuration file should be located.
    ///
    /// # Returns
    ///
    /// Returns the path to the configuration file.
    ///
    /// # Errors
    ///
    /// Returns `Error::Config` if the config directory cannot be determined.
    pub fn config_path() -> Result<PathBuf> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| Error::Config("Could not determine config directory".to_string()))?;

        Ok(config_dir.join("k8s-gui").join("config.toml"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AppConfig::default();
        assert!(config.theme.dark_mode);
        assert_eq!(config.kubernetes.default_namespace, "default");
    }

    #[test]
    fn test_config_serialization() {
        let config = AppConfig::default();
        let toml_str = toml::to_string(&config).unwrap();
        let parsed: AppConfig = toml::from_str(&toml_str).unwrap();

        assert_eq!(config.theme.dark_mode, parsed.theme.dark_mode);
    }
}
