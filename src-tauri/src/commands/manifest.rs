//! Manifest validation and apply commands

use crate::state::AppState;
use crate::utils::normalize_namespace;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tauri::State;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

async fn run_kubectl(
    manifest: String,
    args: Vec<String>,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ManifestResult, String> {
    if manifest.trim().is_empty() {
        return Err("Manifest is empty".to_string());
    }
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let mut cmd = tokio::process::Command::new("kubectl");
    cmd.args(args);
    cmd.arg("--context").arg(&context);

    let ns = normalize_namespace(namespace, state.get_namespace(&context));
    if let Some(ns) = ns {
        cmd.arg("--namespace").arg(ns);
    }

    if let Some(kubeconfig) = state
        .config
        .read()
        .kubernetes
        .kubeconfig_path
        .as_ref()
        .and_then(|path| path.to_str().map(|value| value.to_string()))
    {
        cmd.env("KUBECONFIG", kubeconfig);
    }

    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(manifest.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
    }

    let output = child.wait_with_output().await.map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(ManifestResult {
        success: output.status.success(),
        stdout,
        stderr,
        exit_code: output.status.code(),
    })
}

/// Validate a manifest using server-side dry-run.
#[tauri::command]
pub async fn validate_manifest(
    manifest: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ManifestResult, String> {
    let args = vec![
        "apply".to_string(),
        "--dry-run=server".to_string(),
        "-f".to_string(),
        "-".to_string(),
    ];
    run_kubectl(manifest, args, namespace, state).await
}

/// Apply a manifest to the cluster.
#[tauri::command]
pub async fn apply_manifest(
    manifest: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ManifestResult, String> {
    let args = vec!["apply".to_string(), "-f".to_string(), "-".to_string()];
    run_kubectl(manifest, args, namespace, state).await
}
