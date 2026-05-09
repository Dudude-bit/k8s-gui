//! Container/image registry configuration commands.

use crate::config::{AppConfig, RegistryConfigEntry};
use crate::error::Result;
use serde::{Deserialize, Serialize};

use super::helpers::{read_config, save_config, with_config};

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
