//! Helm commands
//!
//! Provides Helm release management capabilities with native Kubernetes API
//! for read operations and CLI wrapper for write operations.

use crate::commands::helpers::ResourceContext;
use crate::error::{Error, PluginError, Result};
use crate::state::AppState;
use base64::{engine::general_purpose::STANDARD, Engine};
use flate2::read::GzDecoder;
use k8s_openapi::api::core::v1::Secret;
use kube::api::ListParams;
use kube::Api;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::process::Stdio;
use tauri::State;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

/// Helm release info (unified format for frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelmRelease {
    pub name: String,
    pub namespace: String,
    pub revision: i32,
    pub status: String,
    pub chart: String,
    pub app_version: Option<String>,
    pub updated: String,
    /// Source: "native" for helm CLI releases, "flux" for Flux HelmReleases
    pub source: String,
    /// Additional info for Flux releases
    pub suspended: Option<bool>,
    pub source_ref: Option<String>,
}

/// Helm release detail (from Kubernetes Secret)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelmReleaseDetail {
    pub name: String,
    pub namespace: String,
    pub revision: i32,
    pub status: String,
    pub chart: String,
    pub chart_version: String,
    pub app_version: Option<String>,
    pub first_deployed: Option<String>,
    pub last_deployed: Option<String>,
    pub description: Option<String>,
    pub values: serde_json::Value,
    pub manifest: String,
    pub notes: Option<String>,
}

/// Helm revision history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelmRevision {
    pub revision: i32,
    pub updated: String,
    pub status: String,
    pub chart: String,
    pub app_version: Option<String>,
    pub description: Option<String>,
}

/// Helm CLI availability status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelmAvailability {
    pub available: bool,
    pub version: Option<String>,
    pub error: Option<String>,
    /// Path where helm was found (if available)
    pub path: Option<String>,
    /// List of paths that were searched
    pub searched_paths: Vec<String>,
}

/// Helm repository info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelmRepository {
    pub name: String,
    pub url: String,
}

/// Helm chart search result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelmChartSearchResult {
    pub name: String,
    pub version: String,
    pub app_version: String,
    pub description: String,
}

/// Helm install/upgrade options
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelmInstallOptions {
    pub release_name: String,
    pub chart: String,
    pub namespace: String,
    pub version: Option<String>,
    pub values: Option<String>, // YAML string
    pub create_namespace: bool,
    pub wait: bool,
    pub timeout: Option<String>, // e.g. "5m0s"
}

// Internal structures for decoding Helm secrets

#[derive(Debug, Deserialize)]
struct HelmSecretRelease {
    name: String,
    namespace: String,
    version: i32,
    info: HelmSecretInfo,
    chart: HelmSecretChart,
    config: serde_json::Value,
    #[serde(default)]
    manifest: String,
}

#[derive(Debug, Deserialize)]
struct HelmSecretInfo {
    #[serde(default)]
    status: String,
    #[serde(default)]
    first_deployed: Option<String>,
    #[serde(default)]
    last_deployed: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HelmSecretChart {
    metadata: HelmSecretChartMetadata,
}

#[derive(Debug, Deserialize)]
struct HelmSecretChartMetadata {
    name: String,
    version: String,
    #[serde(rename = "appVersion", default)]
    app_version: Option<String>,
}

/// Decode Helm release from Kubernetes Secret data
fn decode_helm_release(data: &[u8]) -> Result<HelmSecretRelease> {
    // Base64 decode
    let compressed = STANDARD
        .decode(data)
        .map_err(|e| Error::Plugin(PluginError::ExecutionFailed(format!("Base64 decode error: {e}"))))?;

    // Check for gzip magic bytes and decompress
    let json_bytes = if compressed.len() >= 2 && compressed[0] == 0x1f && compressed[1] == 0x8b {
        let mut decoder = GzDecoder::new(&compressed[..]);
        let mut decompressed = Vec::new();
        decoder
            .read_to_end(&mut decompressed)
            .map_err(|e| Error::Plugin(PluginError::ExecutionFailed(format!("Gzip decompress error: {e}"))))?;
        decompressed
    } else {
        // Old format: not compressed
        compressed
    };

    // Parse JSON
    serde_json::from_slice(&json_bytes)
        .map_err(|e| Error::Plugin(PluginError::ExecutionFailed(format!("JSON parse error: {e}"))))
}

/// Resolve the helm binary path using config or searching common locations
async fn resolve_helm_path() -> Result<String> {
    use crate::config::AppConfig;

    // First, try custom path from config if set
    if let Ok(config) = AppConfig::load() {
        if let Some(custom_path) = &config.cli_paths.helm_path {
            if !custom_path.is_empty() {
                if try_helm_path(custom_path).await.is_some() {
                    return Ok(custom_path.clone());
                }
            }
        }
    }

    // Try common installation paths
    for path in get_helm_search_paths() {
        if try_helm_path(&path).await.is_some() {
            return Ok(path);
        }
    }

    Err(Error::Plugin(PluginError::NotFound("Helm CLI not found. Install helm or specify a custom path in Settings.".to_string())))
}

/// Get the list of common helm installation paths to search
fn get_helm_search_paths() -> Vec<String> {
    let mut paths = Vec::new();
    
    // Common installation paths
    paths.push("/usr/local/bin/helm".to_string());
    paths.push("/opt/homebrew/bin/helm".to_string()); // ARM macOS Homebrew
    paths.push("/snap/bin/helm".to_string()); // Snap on Linux
    paths.push("/usr/bin/helm".to_string());
    
    // User local bin
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".local/bin/helm").to_string_lossy().to_string());
        // asdf version manager
        paths.push(home.join(".asdf/shims/helm").to_string_lossy().to_string());
    }
    
    // Just "helm" for PATH lookup (last resort)
    paths.push("helm".to_string());
    
    paths
}

/// Try to run helm version with a specific path
async fn try_helm_path(path: &str) -> Option<String> {
    let result = Command::new(path)
        .arg("version")
        .arg("--short")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;
    
    match result {
        Ok(output) if output.status.success() => {
            Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
        }
        _ => None,
    }
}

/// Check if Helm CLI is available
/// 
/// Searches for helm in the following order:
/// 1. Custom path from config (if set)
/// 2. Common installation paths (/usr/local/bin, /opt/homebrew/bin, ~/.local/bin, etc.)
/// 3. PATH environment variable
#[tauri::command]
pub async fn check_helm_availability() -> Result<HelmAvailability> {
    use crate::config::AppConfig;
    
    let mut searched_paths = Vec::new();
    
    // First, try custom path from config if set
    if let Ok(config) = AppConfig::load() {
        if let Some(custom_path) = &config.cli_paths.helm_path {
            if !custom_path.is_empty() {
                searched_paths.push(custom_path.clone());
                if let Some(version) = try_helm_path(custom_path).await {
                    return Ok(HelmAvailability {
                        available: true,
                        version: Some(version),
                        error: None,
                        path: Some(custom_path.clone()),
                        searched_paths,
                    });
                }
            }
        }
    }
    
    // Try common installation paths
    for path in get_helm_search_paths() {
        searched_paths.push(path.clone());
        if let Some(version) = try_helm_path(&path).await {
            return Ok(HelmAvailability {
                available: true,
                version: Some(version),
                error: None,
                path: Some(path),
                searched_paths,
            });
        }
    }
    
    // Helm not found in any path
    Ok(HelmAvailability {
        available: false,
        version: None,
        error: Some("Helm CLI not found in any of the searched paths. You can specify a custom path in Settings.".to_string()),
        path: None,
        searched_paths,
    })
}

/// List Helm releases using native Kubernetes API (reads Helm secrets directly)
#[tauri::command]
pub async fn list_helm_releases_native(
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<HelmRelease>> {
    let ctx = ResourceContext::for_list(&state, namespace)?;

    let secrets: Api<Secret> = ctx.namespaced_or_cluster_api();

    // List secrets with helm label
    let lp = ListParams::default().labels("owner=helm");
    let secret_list = secrets.list(&lp).await?;

    let mut releases_map: HashMap<(String, String), HelmRelease> = HashMap::new();

    for secret in secret_list {
        if let Some(data) = secret.data {
            if let Some(release_data) = data.get("release") {
                match decode_helm_release(&release_data.0) {
                    Ok(release) => {
                        let key = (release.namespace.clone(), release.name.clone());
                        
                        // Keep only the latest revision for each release
                        let should_insert = releases_map
                            .get(&key)
                            .map_or(true, |existing| release.version > existing.revision);

                        if should_insert {
                            let helm_release = HelmRelease {
                                name: release.name,
                                namespace: release.namespace,
                                revision: release.version,
                                status: release.info.status,
                                chart: format!(
                                    "{}-{}",
                                    release.chart.metadata.name, release.chart.metadata.version
                                ),
                                app_version: release.chart.metadata.app_version,
                                updated: release.info.last_deployed.unwrap_or_default(),
                                source: "native".to_string(),
                                suspended: None,
                                source_ref: None,
                            };
                            releases_map.insert(key, helm_release);
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Failed to decode Helm release secret: {}", e);
                    }
                }
            }
        }
    }

    let mut releases: Vec<HelmRelease> = releases_map.into_values().collect();
    releases.sort_by(|a, b| (&a.namespace, &a.name).cmp(&(&b.namespace, &b.name)));

    Ok(releases)
}

/// Get Helm release detail (values, manifest, notes)
#[tauri::command]
pub async fn get_helm_release_detail(
    name: String,
    namespace: String,
    revision: Option<i32>,
    state: State<'_, AppState>,
) -> Result<HelmReleaseDetail> {
    crate::validation::validate_dns_subdomain(&name)?;
    crate::validation::validate_namespace(&namespace)?;
    let ctx = ResourceContext::for_command(&state, Some(namespace.clone()))?;
    let secrets: Api<Secret> = ctx.namespaced_api();

    // Find the specific revision or latest
    let lp = ListParams::default().labels(&format!("owner=helm,name={name}"));
    let secret_list = secrets.list(&lp).await?;

    let mut target_release: Option<HelmSecretRelease> = None;
    let mut max_revision = 0;

    for secret in secret_list {
        if let Some(data) = secret.data {
            if let Some(release_data) = data.get("release") {
                if let Ok(release) = decode_helm_release(&release_data.0) {
                    if let Some(target_rev) = revision {
                        if release.version == target_rev {
                            target_release = Some(release);
                            break;
                        }
                    } else if release.version > max_revision {
                        max_revision = release.version;
                        target_release = Some(release);
                    }
                }
            }
        }
    }

    let release = target_release.ok_or_else(|| {
        Error::Plugin(PluginError::ExecutionFailed(format!(
            "Release {name} not found in namespace {namespace}"
        )))
    })?;

    Ok(HelmReleaseDetail {
        name: release.name,
        namespace: release.namespace,
        revision: release.version,
        status: release.info.status,
        chart: release.chart.metadata.name.clone(),
        chart_version: release.chart.metadata.version,
        app_version: release.chart.metadata.app_version,
        first_deployed: release.info.first_deployed,
        last_deployed: release.info.last_deployed,
        description: release.info.description,
        values: release.config,
        manifest: release.manifest,
        notes: release.info.notes,
    })
}

/// Get Helm release history
#[tauri::command]
pub async fn get_helm_history(
    name: String,
    namespace: String,
    state: State<'_, AppState>,
) -> Result<Vec<HelmRevision>> {
    crate::validation::validate_dns_subdomain(&name)?;
    crate::validation::validate_namespace(&namespace)?;
    let ctx = ResourceContext::for_command(&state, Some(namespace.clone()))?;
    let secrets: Api<Secret> = ctx.namespaced_api();

    let lp = ListParams::default().labels(&format!("owner=helm,name={name}"));
    let secret_list = secrets.list(&lp).await?;

    let mut history: Vec<HelmRevision> = Vec::new();

    for secret in secret_list {
        if let Some(data) = secret.data {
            if let Some(release_data) = data.get("release") {
                if let Ok(release) = decode_helm_release(&release_data.0) {
                    history.push(HelmRevision {
                        revision: release.version,
                        updated: release.info.last_deployed.unwrap_or_default(),
                        status: release.info.status,
                        chart: format!(
                            "{}-{}",
                            release.chart.metadata.name, release.chart.metadata.version
                        ),
                        app_version: release.chart.metadata.app_version,
                        description: release.info.description,
                    });
                }
            }
        }
    }

    // Sort by revision descending (newest first)
    history.sort_by(|a, b| b.revision.cmp(&a.revision));

    Ok(history)
}

// CLI-based write operations

/// Helper to execute helm CLI commands
async fn exec_helm_cli(args: &[&str], timeout_secs: u64) -> Result<String> {
    exec_helm_cli_with_context(args, timeout_secs, None).await
}

/// Helper to execute helm CLI commands with optional kube context
async fn exec_helm_cli_with_context(args: &[&str], timeout_secs: u64, context: Option<&str>) -> Result<String> {
    let helm_path = resolve_helm_path().await?;
    let mut cmd = Command::new(&helm_path);

    // Add kube-context if specified
    if let Some(ctx) = context {
        cmd.arg("--kube-context").arg(ctx);
    }

    cmd.args(args);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let timeout_duration = Duration::from_secs(timeout_secs);

    let output = timeout(timeout_duration, cmd.output())
        .await
        .map_err(|_| Error::Plugin(PluginError::Timeout))?
        .map_err(|e| Error::Plugin(PluginError::ExecutionFailed(e.to_string())))?;

    if !output.status.success() {
        return Err(Error::Plugin(PluginError::ExecutionFailed(
            String::from_utf8_lossy(&output.stderr).to_string(),
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Rollback Helm release to a previous revision
#[tauri::command]
pub async fn helm_rollback(
    name: String,
    namespace: String,
    revision: i32,
    state: State<'_, AppState>,
) -> Result<String> {
    crate::validation::validate_dns_subdomain(&name)?;
    crate::validation::validate_namespace(&namespace)?;

    let context = state.get_current_context();
    let revision_str = revision.to_string();

    exec_helm_cli_with_context(
        &["rollback", &name, &revision_str, "-n", &namespace],
        120,
        context.as_deref(),
    )
    .await
}

/// Uninstall Helm release
#[tauri::command]
pub async fn helm_uninstall(
    name: String,
    namespace: String,
    state: State<'_, AppState>,
) -> Result<String> {
    crate::validation::validate_dns_subdomain(&name)?;
    crate::validation::validate_namespace(&namespace)?;

    let context = state.get_current_context();

    exec_helm_cli_with_context(
        &["uninstall", &name, "-n", &namespace],
        120,
        context.as_deref(),
    )
    .await
}

/// List Helm repositories
#[tauri::command]
pub async fn list_helm_repos() -> Result<Vec<HelmRepository>> {
    let output = exec_helm_cli(&["repo", "list", "-o", "json"], 30).await?;
    
    let repos: Vec<HelmRepository> = serde_json::from_str(&output)
        .map_err(|e| Error::Plugin(PluginError::ExecutionFailed(format!("Failed to parse repos: {e}"))))?;
    
    Ok(repos)
}

/// Add Helm repository
#[tauri::command]
pub async fn add_helm_repo(
    name: String,
    url: String,
) -> Result<String> {
    exec_helm_cli(&["repo", "add", &name, &url], 60).await
}

/// Remove Helm repository
#[tauri::command]
pub async fn remove_helm_repo(name: String) -> Result<String> {
    exec_helm_cli(&["repo", "remove", &name], 30).await
}

/// Update Helm repositories
#[tauri::command]
pub async fn update_helm_repos() -> Result<String> {
    exec_helm_cli(&["repo", "update"], 120).await
}

/// Search for Helm charts in repositories
#[tauri::command]
pub async fn helm_search_charts(
    keyword: String,
) -> Result<Vec<HelmChartSearchResult>> {
    // Search in all repos
    let output = exec_helm_cli(&["search", "repo", &keyword, "-o", "json"], 30).await?;
    
    // Parse JSON output
    #[derive(Deserialize)]
    struct SearchResult {
        name: String,
        version: String,
        app_version: String,
        description: String,
    }
    
    let results: Vec<SearchResult> = serde_json::from_str(&output)
        .map_err(|e| Error::Plugin(PluginError::ExecutionFailed(format!("Failed to parse search results: {e}"))))?;
    
    Ok(results.into_iter().map(|r| HelmChartSearchResult {
        name: r.name,
        version: r.version,
        app_version: r.app_version,
        description: r.description,
    }).collect())
}

/// Helper for install/upgrade operations
async fn helm_install_or_upgrade(
    command: &str,
    options: &HelmInstallOptions,
    context: Option<&str>,
) -> Result<String> {
    let mut args = vec![
        command.to_string(),
        options.release_name.clone(),
        options.chart.clone(),
        "-n".to_string(),
        options.namespace.clone(),
    ];

    if let Some(version) = &options.version {
        args.push("--version".to_string());
        args.push(version.clone());
    }

    // Only for install
    if command == "install" && options.create_namespace {
        args.push("--create-namespace".to_string());
    }

    if options.wait {
        args.push("--wait".to_string());
    }

    if let Some(timeout) = &options.timeout {
        args.push("--timeout".to_string());
        args.push(timeout.clone());
    }

    // Handle values - write to temp file if provided
    let temp_file = if let Some(values) = &options.values {
        if !values.trim().is_empty() {
            let temp_dir = std::env::temp_dir();
            let temp_path = temp_dir.join(format!("helm-values-{}.yaml", uuid::Uuid::new_v4()));
            std::fs::write(&temp_path, values)
                .map_err(|e| Error::Plugin(PluginError::ExecutionFailed(format!("Failed to write values file: {e}"))))?;
            args.push("-f".to_string());
            args.push(temp_path.to_string_lossy().to_string());
            Some(temp_path)
        } else {
            None
        }
    } else {
        None
    };

    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let result = exec_helm_cli_with_context(&args_refs, 300, context).await;

    // Clean up temp file
    if let Some(path) = temp_file {
        let _ = std::fs::remove_file(path);
    }

    result
}

/// Install a Helm chart
#[tauri::command]
pub async fn helm_install(
    options: HelmInstallOptions,
    state: State<'_, AppState>,
) -> Result<String> {
    crate::validation::validate_dns_subdomain(&options.release_name)?;
    crate::validation::validate_namespace(&options.namespace)?;
    let context = state.get_current_context();
    helm_install_or_upgrade("install", &options, context.as_deref()).await
}

/// Upgrade a Helm release
#[tauri::command]
pub async fn helm_upgrade(
    options: HelmInstallOptions,
    state: State<'_, AppState>,
) -> Result<String> {
    crate::validation::validate_dns_subdomain(&options.release_name)?;
    crate::validation::validate_namespace(&options.namespace)?;
    let context = state.get_current_context();
    helm_install_or_upgrade("upgrade", &options, context.as_deref()).await
}
