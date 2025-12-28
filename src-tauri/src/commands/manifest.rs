//! Manifest validation and apply commands using native kube-rs

use crate::state::AppState;
use crate::utils::normalize_namespace;
use kube::{
    api::{Api, DynamicObject, Patch, PatchParams},
    core::GroupVersionKind,
    discovery::{self, ApiCapabilities, ApiResource, Scope},
    ResourceExt,
};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

/// Information about a single applied resource
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedResource {
    pub kind: String,
    pub name: String,
    pub namespace: Option<String>,
    pub action: String, // "created", "configured", "unchanged"
}

/// Parse YAML manifest into multiple documents
fn parse_manifest(manifest: &str) -> Result<Vec<serde_yaml::Value>, String> {
    let mut docs = Vec::new();
    for doc in serde_yaml::Deserializer::from_str(manifest) {
        let value = serde_yaml::Value::deserialize(doc)
            .map_err(|e| format!("Failed to parse YAML: {}", e))?;
        // Skip null documents (empty YAML docs)
        if !value.is_null() {
            docs.push(value);
        }
    }
    Ok(docs)
}

/// Apply a single resource document
async fn apply_resource(
    client: &kube::Client,
    doc: serde_yaml::Value,
    default_namespace: Option<&str>,
    dry_run: bool,
) -> Result<AppliedResource, String> {
    // Extract apiVersion and kind
    let api_version = doc
        .get("apiVersion")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing apiVersion in manifest".to_string())?;
    let kind = doc
        .get("kind")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing kind in manifest".to_string())?;

    // Parse group and version from apiVersion
    let (group, version) = if api_version.contains('/') {
        let parts: Vec<&str> = api_version.splitn(2, '/').collect();
        (parts[0].to_string(), parts[1].to_string())
    } else {
        // Core API group (e.g., "v1")
        (String::new(), api_version.to_string())
    };

    // Get resource name from metadata
    let name = doc
        .get("metadata")
        .and_then(|m| m.get("name"))
        .and_then(|n| n.as_str())
        .ok_or_else(|| "Missing metadata.name in manifest".to_string())?
        .to_string();

    // Get namespace from manifest or use default
    let manifest_namespace = doc
        .get("metadata")
        .and_then(|m| m.get("namespace"))
        .and_then(|n| n.as_str());
    let namespace = manifest_namespace.or(default_namespace);

    // Create GroupVersionKind for discovery
    let gvk = GroupVersionKind::gvk(&group, &version, kind);
    
    // Resolve the resource using pinned API discovery
    let (ar, caps) = discovery::pinned_kind(client, &gvk)
        .await
        .map_err(|e| format!("Failed to discover resource {}/{} {}: {}", group, version, kind, e))?;

    // Convert document to DynamicObject and clean metadata
    let mut obj: DynamicObject = serde_yaml::from_value(doc.clone())
        .map_err(|e| format!("Failed to convert to DynamicObject: {}", e))?;

    // Clean server-managed fields using kube-rs ObjectMeta API
    obj.metadata.managed_fields = None;
    obj.metadata.resource_version = None;
    obj.metadata.uid = None;
    obj.metadata.creation_timestamp = None;
    obj.metadata.generation = None;
    obj.metadata.self_link = None;

    // Create API handle based on scope
    let api: Api<DynamicObject> = if caps.scope == Scope::Cluster {
        Api::all_with(client.clone(), &ar)
    } else {
        let ns = namespace.ok_or_else(|| {
            format!(
                "Namespace required for namespaced resource {}/{}",
                kind, name
            )
        })?;
        Api::namespaced_with(client.clone(), ns, &ar)
    };

    // Apply the resource using server-side apply
    // force=true takes ownership of conflicting fields from other managers
    let mut params = PatchParams::apply("k8s-gui").force();
    if dry_run {
        params = params.dry_run();
    }

    let result = api
        .patch(&name, &params, &Patch::Apply(&obj))
        .await
        .map_err(|e| format!("Failed to apply {}/{}: {}", kind, name, e))?;

    // Determine action based on resource version
    let action = if result.resource_version().is_some() {
        "configured"
    } else {
        "created"
    };

    Ok(AppliedResource {
        kind: kind.to_string(),
        name,
        namespace: namespace.map(|s| s.to_string()),
        action: action.to_string(),
    })
}

/// Internal function to apply or validate manifest
async fn apply_manifest_internal(
    manifest: String,
    namespace: Option<String>,
    state: &State<'_, AppState>,
    dry_run: bool,
) -> Result<ManifestResult, String> {
    if manifest.trim().is_empty() {
        return Err("Manifest is empty".to_string());
    }

    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let ns = normalize_namespace(namespace, state.get_namespace(&context));

    // Parse manifest into documents
    let docs = parse_manifest(&manifest)?;
    if docs.is_empty() {
        return Err("No valid resources found in manifest".to_string());
    }

    let mut results = Vec::new();
    let mut errors = Vec::new();

    for doc in docs {
        match apply_resource(&client, doc, ns.as_deref(), dry_run).await {
            Ok(result) => {
                let msg = if let Some(ref ns) = result.namespace {
                    format!(
                        "{}/{} {} (namespace: {})",
                        result.kind.to_lowercase(),
                        result.name,
                        result.action,
                        ns
                    )
                } else {
                    format!(
                        "{}/{} {}",
                        result.kind.to_lowercase(),
                        result.name,
                        result.action
                    )
                };
                results.push(msg);
            }
            Err(e) => {
                errors.push(e);
            }
        }
    }

    let stdout = results.join("\n");
    let stderr = errors.join("\n");
    let success = errors.is_empty();

    Ok(ManifestResult {
        success,
        stdout,
        stderr,
        exit_code: if success { Some(0) } else { Some(1) },
    })
}

/// Validate a manifest using server-side dry-run.
#[tauri::command]
pub async fn validate_manifest(
    manifest: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ManifestResult, String> {
    apply_manifest_internal(manifest, namespace, &state, true).await
}

/// Apply a manifest to the cluster.
#[tauri::command]
pub async fn apply_manifest(
    manifest: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ManifestResult, String> {
    apply_manifest_internal(manifest, namespace, &state, false).await
}
