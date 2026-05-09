//! Native helm-secret reads — list / detail / history. Helm 3 stores
//! each release as a Kubernetes Secret with `owner=helm` label and a
//! gzipped+base64'd JSON `release` blob inside `data`. Reading them
//! directly from the API server avoids the helm CLI dependency for
//! the read-only paths.

use crate::commands::helpers::ResourceContext;
use crate::error::{Error, PluginError, Result};
use crate::state::AppState;
use base64::{engine::general_purpose::STANDARD, Engine};
use flate2::read::GzDecoder;
use k8s_openapi::api::core::v1::Secret;
use kube::api::ListParams;
use kube::Api;
use std::collections::HashMap;
use std::io::Read;
use tauri::State;

use super::types::{HelmRelease, HelmReleaseDetail, HelmRevision, HelmSecretRelease};

/// Decode Helm release from Kubernetes Secret data
fn decode_helm_release(data: &[u8]) -> Result<HelmSecretRelease> {
    // Base64 decode
    let compressed = STANDARD.decode(data).map_err(|e| {
        Error::Plugin(PluginError::ExecutionFailed(format!(
            "Base64 decode error: {e}"
        )))
    })?;

    // Check for gzip magic bytes and decompress
    let json_bytes = if compressed.len() >= 2 && compressed[0] == 0x1f && compressed[1] == 0x8b {
        let mut decoder = GzDecoder::new(&compressed[..]);
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed).map_err(|e| {
            Error::Plugin(PluginError::ExecutionFailed(format!(
                "Gzip decompress error: {e}"
            )))
        })?;
        decompressed
    } else {
        // Old format: not compressed
        compressed
    };

    // Parse JSON
    serde_json::from_slice(&json_bytes).map_err(|e| {
        Error::Plugin(PluginError::ExecutionFailed(format!(
            "JSON parse error: {e}"
        )))
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
