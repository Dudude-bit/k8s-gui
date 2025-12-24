//! Plugin management commands

use crate::plugins::{PluginInfo, PluginResult, PluginContext};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

/// Kubectl plugin info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KubectlPluginInfo {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
}

/// Helm release info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelmRelease {
    pub name: String,
    pub namespace: String,
    pub revision: i32,
    pub status: String,
    pub chart: String,
    pub app_version: Option<String>,
    pub updated: String,
}

/// Helm history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelmHistoryEntry {
    pub revision: i32,
    pub status: String,
    pub chart: String,
    pub app_version: Option<String>,
    pub description: String,
    pub updated: String,
}

/// Context menu item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextMenuItem {
    pub id: String,
    pub label: String,
    pub icon: Option<String>,
    pub shortcut: Option<String>,
}

/// Resource renderer info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceRendererInfo {
    pub name: String,
    pub supported_api_versions: Vec<String>,
    pub supported_kinds: Vec<String>,
}

/// Rendered resource
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderedResource {
    pub html: Option<String>,
    pub sections: Vec<serde_json::Value>,
}

/// List Helm releases
#[tauri::command]
pub async fn list_helm_releases(
    namespace: Option<String>,
    _state: State<'_, AppState>,
) -> Result<Vec<HelmRelease>, String> {
    let mut cmd = tokio::process::Command::new("helm");
    cmd.arg("list").arg("-o").arg("json");
    
    if let Some(ns) = namespace {
        cmd.arg("-n").arg(ns);
    } else {
        cmd.arg("-A");
    }
    
    let output = cmd.output().await.map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    let releases: Vec<HelmRelease> = serde_json::from_slice(&output.stdout)
        .map_err(|e| e.to_string())?;
    
    Ok(releases)
}

