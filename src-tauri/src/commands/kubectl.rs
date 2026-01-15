//! kubectl CLI path resolution and availability check

use crate::config::AppConfig;
use crate::error::{Error, PluginError, Result};
use crate::shell::ShellCommand;
use serde::Serialize;
use std::time::Duration;

/// kubectl availability information
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KubectlAvailability {
    /// Whether kubectl is available
    pub available: bool,
    /// kubectl version string
    pub version: Option<String>,
    /// Error message if not available
    pub error: Option<String>,
    /// Path where kubectl was found
    pub path: Option<String>,
    /// List of paths that were searched
    pub searched_paths: Vec<String>,
}

/// Resolve the kubectl binary path using config or searching common locations
pub async fn resolve_kubectl_path() -> Result<String> {
    // First, try custom path from config if set
    if let Ok(config) = AppConfig::load() {
        if let Some(custom_path) = &config.cli_paths.kubectl_path {
            if !custom_path.is_empty() {
                if try_kubectl_path(custom_path).await.is_some() {
                    return Ok(custom_path.clone());
                }
            }
        }
    }

    // Try common installation paths
    for path in get_kubectl_search_paths() {
        if try_kubectl_path(&path).await.is_some() {
            return Ok(path);
        }
    }

    Err(Error::Plugin(PluginError::NotFound(
        "kubectl CLI not found. Install kubectl or specify a custom path in Settings.".to_string(),
    )))
}

/// Get the list of common kubectl installation paths to search
pub fn get_kubectl_search_paths() -> Vec<String> {
    let mut paths = Vec::new();

    // Common installation paths
    paths.push("/usr/local/bin/kubectl".to_string());
    paths.push("/opt/homebrew/bin/kubectl".to_string()); // ARM macOS Homebrew
    paths.push("/snap/bin/kubectl".to_string()); // Snap on Linux
    paths.push("/usr/bin/kubectl".to_string());

    // User local bin
    if let Some(home) = dirs::home_dir() {
        paths.push(
            home.join(".local/bin/kubectl")
                .to_string_lossy()
                .to_string(),
        );
        // asdf version manager
        paths.push(
            home.join(".asdf/shims/kubectl")
                .to_string_lossy()
                .to_string(),
        );
        // krew plugin manager
        paths.push(
            home.join(".krew/bin/kubectl")
                .to_string_lossy()
                .to_string(),
        );
    }

    // Just "kubectl" for PATH lookup (last resort)
    paths.push("kubectl".to_string());

    paths
}

/// Try to run kubectl version with a specific path
async fn try_kubectl_path(path: &str) -> Option<String> {
    let output = ShellCommand::new(path)
        .args(["version", "--client", "-o=yaml"])
        .timeout(Duration::from_secs(5))
        .run()
        .await
        .ok()?;

    if output.success() {
        // Parse version from YAML output
        for line in output.stdout.lines() {
            if line.trim().starts_with("gitVersion:") {
                return Some(line.trim().replace("gitVersion:", "").trim().to_string());
            }
        }
        Some("unknown".to_string())
    } else {
        None
    }
}

/// Check if kubectl CLI is available
#[tauri::command]
pub async fn check_kubectl_availability() -> Result<KubectlAvailability> {
    let searched_paths = get_all_search_paths();

    match resolve_kubectl_path().await {
        Ok(path) => {
            let version = try_kubectl_path(&path).await;
            Ok(KubectlAvailability {
                available: true,
                version,
                error: None,
                path: Some(path),
                searched_paths,
            })
        }
        Err(e) => Ok(KubectlAvailability {
            available: false,
            version: None,
            error: Some(e.to_string()),
            path: None,
            searched_paths,
        }),
    }
}

/// Get all paths that will be searched (for UI display)
fn get_all_search_paths() -> Vec<String> {
    let mut paths = Vec::new();

    // Custom path from config
    if let Ok(config) = AppConfig::load() {
        if let Some(custom_path) = &config.cli_paths.kubectl_path {
            if !custom_path.is_empty() {
                paths.push(custom_path.clone());
            }
        }
    }

    paths.extend(get_kubectl_search_paths());
    paths
}
