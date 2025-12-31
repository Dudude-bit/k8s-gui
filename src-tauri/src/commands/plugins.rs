//! Plugin management commands

use crate::error::{Error, PluginError, Result};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

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

/// List Helm releases
#[tauri::command]
pub async fn list_helm_releases(
    namespace: Option<String>,
    _state: State<'_, AppState>,
) -> Result<Vec<HelmRelease>> {
    let mut cmd = tokio::process::Command::new("helm");
    cmd.arg("list").arg("-o").arg("json");

    if let Some(ns) = namespace {
        cmd.arg("-n").arg(ns);
    } else {
        cmd.arg("-A");
    }

    let output = cmd
        .output()
        .await
        .map_err(|e| Error::Plugin(PluginError::ExecutionFailed(e.to_string())))?;

    if !output.status.success() {
        return Err(Error::Plugin(PluginError::ExecutionFailed(
            String::from_utf8_lossy(&output.stderr).to_string(),
        )));
    }

    let releases: Vec<HelmRelease> =
        serde_json::from_slice(&output.stdout).map_err(Error::from)?;

    Ok(releases)
}
