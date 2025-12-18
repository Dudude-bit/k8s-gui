//! Application configuration

use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Application configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
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

fn default_dark_mode() -> bool { true }
fn default_accent_color() -> String { "#3b82f6".to_string() }
fn default_font_size() -> u8 { 14 }

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

fn default_namespace() -> String { "default".to_string() }
fn default_timeout() -> u64 { 30 }
fn default_true() -> bool { true }
fn default_refresh_interval() -> u64 { 30 }

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

fn default_cache_ttl() -> u64 { 60 }
fn default_max_entries() -> usize { 1000 }

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

fn default_plugin_timeout() -> u64 { 60 }

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

fn default_log_level() -> String { "info".to_string() }
fn default_log_size() -> u64 { 10 }

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: default_log_level(),
            file: None,
            max_size_mb: default_log_size(),
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: ThemeConfig::default(),
            kubernetes: KubernetesConfig::default(),
            cache: CacheConfig::default(),
            plugins: PluginsConfig::default(),
            logging: LoggingConfig::default(),
        }
    }
}

impl AppConfig {
    /// Load configuration from file
    pub fn load() -> Result<Self> {
        let config_path = Self::config_path()?;
        
        if config_path.exists() {
            let content = std::fs::read_to_string(&config_path)
                .map_err(|e| Error::Config(format!("Failed to read config: {}", e)))?;
            
            let config: Self = toml::from_str(&content)
                .map_err(|e| Error::Config(format!("Failed to parse config: {}", e)))?;
            
            Ok(config)
        } else {
            // Return default config
            Ok(Self::default())
        }
    }

    /// Save configuration to file
    pub fn save(&self) -> Result<()> {
        let config_path = Self::config_path()?;
        
        // Create directory if needed
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| Error::Config(format!("Failed to create config dir: {}", e)))?;
        }
        
        let content = toml::to_string_pretty(self)
            .map_err(|e| Error::Config(format!("Failed to serialize config: {}", e)))?;
        
        std::fs::write(&config_path, content)
            .map_err(|e| Error::Config(format!("Failed to write config: {}", e)))?;
        
        Ok(())
    }

    /// Get the configuration file path
    pub fn config_path() -> Result<PathBuf> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| Error::Config("Could not determine config directory".to_string()))?;
        
        Ok(config_dir.join("k8s-gui").join("config.toml"))
    }

    /// Get the data directory path
    pub fn data_dir() -> Result<PathBuf> {
        let data_dir = dirs::data_dir()
            .ok_or_else(|| Error::Config("Could not determine data directory".to_string()))?;
        
        Ok(data_dir.join("k8s-gui"))
    }

    /// Get the cache directory path
    pub fn cache_dir() -> Result<PathBuf> {
        let cache_dir = dirs::cache_dir()
            .ok_or_else(|| Error::Config("Could not determine cache directory".to_string()))?;
        
        Ok(cache_dir.join("k8s-gui"))
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
