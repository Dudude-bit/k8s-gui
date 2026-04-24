//! Manifest validation and application commands
//!
//! Provides Kubernetes API-based manifest operations for applying and validating YAML manifests.

use crate::commands::helpers::ResourceContext;
use crate::error::{Error, Result};
use crate::state::AppState;
use kube::api::{DeleteParams, Patch, PatchParams};
use kube::core::DynamicObject;
use kube::discovery::ApiResource;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Result of manifest operation (validate or apply)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestResult {
    /// Whether the operation succeeded
    pub success: bool,
    /// Standard output / success message
    pub stdout: String,
    /// Error message if any
    pub stderr: String,
    /// Exit code (0 for success, 1 for error)
    pub exit_code: i32,
}

impl ManifestResult {
    fn success(message: String) -> Self {
        Self {
            success: true,
            stdout: message,
            stderr: String::new(),
            exit_code: 0,
        }
    }

    fn error(message: String) -> Self {
        Self {
            success: false,
            stdout: String::new(),
            stderr: message,
            exit_code: 1,
        }
    }
}

/// Parsed manifest with API resource info
struct ParsedManifest {
    api_resource: ApiResource,
    object: DynamicObject,
    namespace: Option<String>,
}

impl ParsedManifest {
    /// Get the effective namespace (from manifest, fallback, or "default")
    fn effective_namespace(&self, fallback: &Option<String>) -> String {
        self.namespace
            .clone()
            .or_else(|| fallback.clone())
            .unwrap_or_else(|| "default".to_string())
    }

    /// Get the resource name or "<unnamed>"
    fn name(&self) -> String {
        self.object
            .metadata
            .name
            .clone()
            .unwrap_or_else(|| "<unnamed>".to_string())
    }

    /// Get the resource name, returning error if missing
    fn require_name(&self) -> Result<String> {
        self.object
            .metadata
            .name
            .clone()
            .ok_or_else(|| Error::InvalidInput("Resource name is required".to_string()))
    }

    /// Format resource identifier for messages (e.g., "deployment/default nginx")
    fn format_id(&self, namespace: &str, action: &str) -> String {
        format!(
            "{}/{} {} {}",
            self.api_resource.kind.to_lowercase(),
            namespace,
            self.name(),
            action
        )
    }
}

/// Parse all documents from a manifest string
fn parse_all_documents(manifest: &str) -> Result<Vec<ParsedManifest>> {
    let documents = split_yaml_documents(manifest);

    if documents.is_empty() {
        return Err(Error::InvalidInput(
            "No valid YAML documents found".to_string(),
        ));
    }

    documents
        .iter()
        .enumerate()
        .map(|(i, doc)| {
            parse_manifest_document(doc)
                .map_err(|e| Error::InvalidInput(format!("Document {}: {}", i + 1, e)))
        })
        .collect()
}

/// Parse a single YAML document into a DynamicObject with API resource info
fn parse_manifest_document(yaml_doc: &str) -> Result<ParsedManifest> {
    // Parse YAML to get apiVersion and kind
    let value: serde_yaml::Value =
        serde_yaml::from_str(yaml_doc).map_err(|e| Error::Serialization(e.to_string()))?;

    let api_version = value
        .get("apiVersion")
        .and_then(|v| v.as_str())
        .ok_or_else(|| Error::InvalidInput("Missing apiVersion in manifest".to_string()))?;

    let kind = value
        .get("kind")
        .and_then(|v| v.as_str())
        .ok_or_else(|| Error::InvalidInput("Missing kind in manifest".to_string()))?;

    let metadata = value
        .get("metadata")
        .ok_or_else(|| Error::InvalidInput("Missing metadata in manifest".to_string()))?;

    let name = metadata
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| Error::InvalidInput("Missing metadata.name in manifest".to_string()))?;

    let namespace = metadata.get("namespace").and_then(|v| v.as_str());

    // Parse group and version from apiVersion
    let (group, version) = if api_version.contains('/') {
        let parts: Vec<&str> = api_version.splitn(2, '/').collect();
        (parts[0].to_string(), parts[1].to_string())
    } else {
        // Core API (v1)
        (String::new(), api_version.to_string())
    };

    // Create ApiResource
    let api_resource = ApiResource {
        group,
        version,
        kind: kind.to_string(),
        api_version: api_version.to_string(),
        plural: pluralize(kind),
    };

    // Parse as DynamicObject
    let mut object: DynamicObject =
        serde_yaml::from_str(yaml_doc).map_err(|e| Error::Serialization(e.to_string()))?;

    // Ensure metadata is set
    if object.metadata.name.is_none() {
        object.metadata.name = Some(name.to_string());
    }

    Ok(ParsedManifest {
        api_resource,
        object,
        namespace: namespace.map(String::from),
    })
}

/// Simple pluralization for Kubernetes resource kinds
fn pluralize(kind: &str) -> String {
    let lower = kind.to_lowercase();

    // Special cases
    match lower.as_str() {
        "endpoints" => "endpoints".to_string(),
        "ingress" => "ingresses".to_string(),
        "networkpolicy" => "networkpolicies".to_string(),
        "podsecuritypolicy" => "podsecuritypolicies".to_string(),
        "storageclass" => "storageclasses".to_string(),
        "ingressclass" => "ingressclasses".to_string(),
        "runtimeclass" => "runtimeclasses".to_string(),
        "priorityclass" => "priorityclasses".to_string(),
        _ => {
            // Standard pluralization rules
            if lower.ends_with("s") || lower.ends_with("x") || lower.ends_with("ch") {
                format!("{lower}es")
            } else if lower.ends_with("y") {
                format!("{}ies", &lower[..lower.len() - 1])
            } else {
                format!("{lower}s")
            }
        }
    }
}

/// Split YAML into multiple documents
fn split_yaml_documents(manifest: &str) -> Vec<String> {
    manifest
        .split("\n---")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && !s.starts_with('#'))
        .map(String::from)
        .collect()
}

/// Validate a Kubernetes manifest (parse and check structure)
///
/// This performs client-side validation of the manifest without applying it.
#[tauri::command]
pub async fn validate_manifest(
    manifest: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ManifestResult> {
    let parsed_docs = match parse_all_documents(&manifest) {
        Ok(docs) => docs,
        Err(e) => return Ok(ManifestResult::error(e.to_string())),
    };

    let results: Vec<String> = parsed_docs
        .iter()
        .map(|p| p.format_id(&p.effective_namespace(&namespace), "validated"))
        .collect();

    // Verify we have a connection for server-side validation
    if state.get_current_context().is_none() {
        return Ok(ManifestResult::error(
            "No cluster connected. Client-side validation passed, but server validation skipped."
                .to_string(),
        ));
    }

    Ok(ManifestResult::success(format!(
        "Validation passed:\n{}",
        results.join("\n")
    )))
}

/// Apply a Kubernetes manifest to the cluster using server-side apply
#[tauri::command]
pub async fn apply_manifest(
    manifest: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ManifestResult> {
    let parsed_docs = match parse_all_documents(&manifest) {
        Ok(docs) => docs,
        Err(e) => return Ok(ManifestResult::error(e.to_string())),
    };

    let mut results = Vec::new();
    let patch_params = PatchParams::apply("k8s-gui").force();

    for parsed in parsed_docs {
        let ns = parsed.effective_namespace(&namespace);
        let name = parsed.name();
        let ctx = ResourceContext::for_command(&state, Some(ns.clone()))?;
        let api = ctx.dynamic_api_for_resource(
            &parsed.api_resource,
            is_cluster_scoped(&parsed.api_resource.kind),
        );

        match api
            .patch(&name, &patch_params, &Patch::Apply(&parsed.object))
            .await
        {
            Ok(_) => results.push(parsed.format_id(&ns, "configured")),
            Err(e) => {
                return Ok(ManifestResult::error(format!(
                    "Failed to apply {}: {}",
                    parsed.format_id(&ns, ""),
                    e
                )));
            }
        }
    }

    Ok(ManifestResult::success(results.join("\n")))
}

/// Delete resources defined in a manifest
#[tauri::command]
pub async fn delete_manifest(
    manifest: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ManifestResult> {
    let parsed_docs = match parse_all_documents(&manifest) {
        Ok(docs) => docs,
        Err(e) => return Ok(ManifestResult::error(e.to_string())),
    };

    let mut results = Vec::new();

    for parsed in parsed_docs {
        let ns = parsed.effective_namespace(&namespace);
        let name = match parsed.require_name() {
            Ok(n) => n,
            Err(e) => return Ok(ManifestResult::error(e.to_string())),
        };
        let ctx = ResourceContext::for_command(&state, Some(ns.clone()))?;
        let api = ctx.dynamic_api_for_resource(
            &parsed.api_resource,
            is_cluster_scoped(&parsed.api_resource.kind),
        );

        match api.delete(&name, &DeleteParams::default()).await {
            Ok(_) => results.push(parsed.format_id(&ns, "deleted")),
            Err(e) => {
                return Ok(ManifestResult::error(format!(
                    "Failed to delete {}: {}",
                    parsed.format_id(&ns, ""),
                    e
                )));
            }
        }
    }

    Ok(ManifestResult::success(results.join("\n")))
}

/// Check if a kind is cluster-scoped (not namespaced)
fn is_cluster_scoped(kind: &str) -> bool {
    matches!(
        kind,
        "Namespace"
            | "Node"
            | "PersistentVolume"
            | "ClusterRole"
            | "ClusterRoleBinding"
            | "StorageClass"
            | "PriorityClass"
            | "IngressClass"
            | "RuntimeClass"
            | "CustomResourceDefinition"
            | "APIService"
            | "MutatingWebhookConfiguration"
            | "ValidatingWebhookConfiguration"
            | "PodSecurityPolicy"
            | "CertificateSigningRequest"
    )
}

/// Get a resource manifest as YAML
///
/// Fetches any Kubernetes resource by kind, apiVersion, name and namespace.
#[tauri::command]
pub async fn get_manifest(
    kind: String,
    api_version: String,
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    // Parse group and version from apiVersion
    let (group, version) = if api_version.contains('/') {
        let parts: Vec<&str> = api_version.splitn(2, '/').collect();
        (parts[0].to_string(), parts[1].to_string())
    } else {
        (String::new(), api_version.clone())
    };

    let api_resource = ApiResource {
        group,
        version,
        kind: kind.clone(),
        api_version,
        plural: pluralize(&kind),
    };

    let ns = namespace.unwrap_or_else(|| "default".to_string());
    let ctx = ResourceContext::for_command(&state, Some(ns.clone()))?;
    let api = ctx.dynamic_api_for_resource(&api_resource, is_cluster_scoped(&api_resource.kind));

    let resource = api.get(&name).await?;

    let yaml = serde_yaml::to_string(&resource).map_err(|e| Error::Serialization(e.to_string()))?;

    crate::commands::helpers::clean_yaml_for_editor(&yaml)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pluralize() {
        assert_eq!(pluralize("Pod"), "pods");
        assert_eq!(pluralize("Deployment"), "deployments");
        assert_eq!(pluralize("Service"), "services");
        assert_eq!(pluralize("Ingress"), "ingresses");
        assert_eq!(pluralize("NetworkPolicy"), "networkpolicies");
        assert_eq!(pluralize("StorageClass"), "storageclasses");
    }

    #[test]
    fn test_split_yaml_documents() {
        let yaml = r"
apiVersion: v1
kind: ConfigMap
metadata:
    name: test1
---
apiVersion: v1
kind: ConfigMap
metadata:
    name: test2
";
        let docs = split_yaml_documents(yaml);
        assert_eq!(docs.len(), 2);
    }

    #[test]
    fn test_parse_manifest_document() {
        let yaml = r"
apiVersion: v1
kind: ConfigMap
metadata:
    name: test-config
    namespace: default
data:
    key: value
";
        let parsed = parse_manifest_document(yaml).unwrap();
        assert_eq!(parsed.api_resource.kind, "ConfigMap");
        assert_eq!(parsed.api_resource.version, "v1");
        assert_eq!(parsed.namespace, Some("default".to_string()));
    }

    #[test]
    fn test_parse_apps_api() {
        let yaml = r"
apiVersion: apps/v1
kind: Deployment
metadata:
    name: test-deploy
";
        let parsed = parse_manifest_document(yaml).unwrap();
        assert_eq!(parsed.api_resource.kind, "Deployment");
        assert_eq!(parsed.api_resource.group, "apps");
        assert_eq!(parsed.api_resource.version, "v1");
    }

    #[test]
    fn test_manifest_result_serialization() {
        let result = ManifestResult::success("deployment.apps/nginx created".to_string());

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("success"));
        assert!(json.contains("nginx"));
    }
}
