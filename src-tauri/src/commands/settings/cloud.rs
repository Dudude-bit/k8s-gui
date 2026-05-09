//! Cloud auth profile commands — GCP profiles, Azure profiles,
//! kubeconfig context bindings, and CLI tool paths. Grouped because
//! they all manage the cloud-auth side of the kubeconfig story.

use crate::auth::AuthProvider;
use crate::config::{AppConfig, AzureProfile, CliPathsConfig, ContextBinding, GcpProfile};
use crate::error::Result;
use serde::{Deserialize, Serialize};

use super::helpers::{read_config, with_config};

// ============================================================================
// GCP Profiles
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GcpProfileInfo {
    pub name: String,
    pub profile: GcpProfile,
}

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

#[tauri::command]
pub fn get_gcp_profile(name: String) -> Result<Option<GcpProfile>> {
    read_config(|config| config.cloud.gcp_profiles.get(&name).cloned())
}

#[tauri::command]
pub fn save_gcp_profile(name: String, profile: GcpProfile) -> Result<()> {
    with_config(|config| {
        config
            .cloud
            .gcp_profiles
            .insert(name, profile.clean_empty_strings());
    })
}

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

#[tauri::command]
pub async fn test_gcp_profile(name: String) -> Result<String> {
    use crate::auth::GcpGkeAuth;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureProfileInfo {
    pub name: String,
    pub profile: AzureProfile,
}

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

#[tauri::command]
pub fn get_azure_profile(name: String) -> Result<Option<AzureProfile>> {
    read_config(|config| config.cloud.azure_profiles.get(&name).cloned())
}

#[tauri::command]
pub fn save_azure_profile(name: String, profile: AzureProfile) -> Result<()> {
    with_config(|config| {
        config
            .cloud
            .azure_profiles
            .insert(name, profile.clean_empty_strings());
    })
}

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

#[tauri::command]
pub async fn test_azure_profile(name: String) -> Result<String> {
    use crate::auth::AzureAksAuth;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextBindingInfo {
    pub context_name: String,
    pub gcp_profile: Option<String>,
    pub azure_profile: Option<String>,
}

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

#[tauri::command]
pub fn delete_context_binding(context: String) -> Result<()> {
    with_config(|config| {
        config.cloud.context_bindings.remove(&context);
    })
}

// ============================================================================
// CLI Paths
// ============================================================================

#[tauri::command]
pub fn get_cli_paths() -> Result<CliPathsConfig> {
    read_config(|config| config.cli_paths.clone())
}

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
