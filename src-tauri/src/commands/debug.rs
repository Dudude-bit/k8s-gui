//! Debug commands for kubectl debug functionality
//!
//! This module provides three debug modes:
//! - Ephemeral Container: Add a debug container to an existing pod
//! - Copy Pod: Create a copy of a pod with a debug container
//! - Node Debug: Create a privileged pod for node-level debugging

use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

use k8s_openapi::api::core::v1::{
    Capabilities, Container, HostPathVolumeSource, Pod, PodSpec, SecurityContext, Toleration,
    Volume, VolumeMount,
};
use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
use kube::api::{Api, Patch, PatchParams, PostParams};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::helpers::ResourceContext;
use crate::error::{Error, Result};
use crate::state::AppState;
use crate::utils::require_namespace;

/// Configuration for debug session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugConfig {
    /// Debug container image
    pub image: String,
    /// Target container name (for ephemeral mode - to share process namespace)
    pub target_container: Option<String>,
    /// Custom command to run in debug container
    pub command: Option<Vec<String>>,
    /// Share process namespace with target container (for copy mode)
    pub share_processes: bool,
    /// Timeout waiting for container readiness (seconds), default 120
    pub timeout_seconds: Option<u32>,
}

/// Result of debug operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugResult {
    /// Name of the pod to connect to
    pub pod_name: String,
    /// Container name for exec
    pub container_name: String,
    /// Namespace
    pub namespace: String,
    /// Whether this is a newly created pod (copy/node) or existing (ephemeral)
    pub is_new_pod: bool,
}

/// Debug operation for tracking container readiness
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugOperation {
    /// Unique operation ID
    pub id: String,
    /// Operation type
    pub operation_type: DebugOperationType,
    /// Pod name (target or being created)
    pub pod_name: String,
    /// Container name
    pub container_name: String,
    /// Namespace
    pub namespace: String,
    /// Creation time (unix timestamp)
    pub created_at: u64,
    /// Readiness timeout (seconds)
    pub timeout_seconds: u32,
}

/// Type of debug operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DebugOperationType {
    Ephemeral,
    CopyPod,
    NodeDebug,
}

/// Status of debug operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
pub enum DebugStatus {
    /// Waiting for container to be ready
    Pending { reason: String },
    /// Container is ready
    Ready { result: DebugResult },
    /// Container failed to start
    Failed { error: String },
    /// Timeout waiting for container
    Timeout,
}

/// Generate a unique debugger container name
fn generate_debugger_name() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("debugger-{}", timestamp)
}

/// Generate a unique debug pod name
fn generate_debug_pod_name(base_name: &str) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Truncate base name if too long to fit within 63 char limit
    let max_base_len = 63 - 7 - 10; // -debug- (7) + timestamp (10)
    let truncated = if base_name.len() > max_base_len {
        &base_name[..max_base_len]
    } else {
        base_name
    };
    format!("{}-debug-{}", truncated, timestamp)
}

/// Add an ephemeral debug container to an existing pod
#[tauri::command]
pub async fn debug_pod_ephemeral(
    pod_name: String,
    namespace: Option<String>,
    config: DebugConfig,
    state: State<'_, AppState>,
) -> Result<DebugOperation> {
    crate::validation::validate_dns_label(&pod_name)?;

    let ctx = ResourceContext::for_command(&state, namespace)?;
    let api: Api<Pod> = ctx.namespaced_api();
    let ns = require_namespace(ctx.namespace.clone(), "default".to_string())?;

    // Verify pod exists
    let _pod = api.get(&pod_name).await?;

    let container_name = generate_debugger_name();

    // Build ephemeral container spec
    let mut ephemeral_container = serde_json::json!({
        "name": container_name,
        "image": config.image,
        "stdin": true,
        "tty": true,
        "securityContext": {
            "capabilities": {
                "add": ["SYS_PTRACE"]
            }
        }
    });

    // Add target container if specified (for process namespace sharing)
    if let Some(ref target) = config.target_container {
        ephemeral_container["targetContainerName"] = serde_json::json!(target);
    }

    // Add custom command if specified
    if let Some(ref cmd) = config.command {
        if !cmd.is_empty() {
            ephemeral_container["command"] = serde_json::json!(cmd);
        }
    }

    // Create the patch
    let patch = serde_json::json!({
        "spec": {
            "ephemeralContainers": [ephemeral_container]
        }
    });

    // Apply the patch using the ephemeralcontainers subresource
    let patch_params = PatchParams::default();
    api.patch_subresource(
        "ephemeralcontainers",
        &pod_name,
        &patch_params,
        &Patch::Strategic(&patch),
    )
    .await
    .map_err(|e| {
        // Provide helpful error message for unsupported clusters
        if e.to_string().contains("not found")
            || e.to_string().contains("ephemeralContainers")
            || e.to_string().contains("404")
        {
            Error::InvalidInput(
                "Ephemeral containers are not supported on this cluster. \
                 Requires Kubernetes 1.25+. Try using 'Copy Pod' mode instead."
                    .to_string(),
            )
        } else {
            Error::from(e)
        }
    })?;

    // Create and store the debug operation
    let operation_id = format!("debug-{}", uuid::Uuid::new_v4());
    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let timeout_seconds = config.timeout_seconds.unwrap_or(120);

    let operation = DebugOperation {
        id: operation_id.clone(),
        operation_type: DebugOperationType::Ephemeral,
        pod_name,
        container_name,
        namespace: ns,
        created_at,
        timeout_seconds,
    };

    state.debug_operations.insert(operation_id, operation.clone());

    Ok(operation)
}

/// Create a copy of a pod with a debug container
#[tauri::command]
pub async fn debug_pod_copy(
    pod_name: String,
    namespace: Option<String>,
    config: DebugConfig,
    state: State<'_, AppState>,
) -> Result<DebugOperation> {
    crate::validation::validate_dns_label(&pod_name)?;

    let ctx = ResourceContext::for_command(&state, namespace)?;
    let api: Api<Pod> = ctx.namespaced_api();
    let ns = require_namespace(ctx.namespace.clone(), "default".to_string())?;

    // Get the original pod
    let original_pod = api.get(&pod_name).await?;

    let debug_pod_name = generate_debug_pod_name(&pod_name);
    let container_name = generate_debugger_name();

    // Build the debug container
    let debug_container = Container {
        name: container_name.clone(),
        image: Some(config.image.clone()),
        stdin: Some(true),
        tty: Some(true),
        command: config.command.clone(),
        security_context: Some(SecurityContext {
            capabilities: Some(Capabilities {
                add: Some(vec!["SYS_PTRACE".to_string()]),
                ..Default::default()
            }),
            ..Default::default()
        }),
        ..Default::default()
    };

    // Clone and modify the pod spec
    let mut new_spec = original_pod.spec.clone().unwrap_or_default();

    // Clear ephemeral containers - cannot be set on pod creation
    new_spec.ephemeral_containers = None;

    // Clear scheduling constraints to allow rescheduling
    new_spec.node_name = None;
    new_spec.node_selector = None;

    // Enable process namespace sharing if requested
    if config.share_processes {
        new_spec.share_process_namespace = Some(true);
    }

    // Add the debug container
    new_spec.containers.push(debug_container);

    // Set restart policy to Never for debug pods
    new_spec.restart_policy = Some("Never".to_string());

    // Add TTL - auto-terminate after 1 hour
    new_spec.active_deadline_seconds = Some(3600);

    // Get current timestamp for labels
    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Create labels for the debug pod
    let mut labels = BTreeMap::new();
    labels.insert("k8s-gui/debug-pod".to_string(), "true".to_string());
    labels.insert(
        "k8s-gui/debug-source".to_string(),
        pod_name.clone(),
    );
    labels.insert(
        "k8s-gui/created-at".to_string(),
        created_at.to_string(),
    );

    // Create the debug pod
    let debug_pod = Pod {
        metadata: ObjectMeta {
            name: Some(debug_pod_name.clone()),
            namespace: Some(ns.clone()),
            labels: Some(labels),
            // Don't copy owner references - we don't want controllers managing this pod
            ..Default::default()
        },
        spec: Some(new_spec),
        ..Default::default()
    };

    // Create the pod
    api.create(&PostParams::default(), &debug_pod).await?;

    // Create and store the debug operation
    let operation_id = format!("debug-{}", uuid::Uuid::new_v4());
    let timeout_seconds = config.timeout_seconds.unwrap_or(120);

    let operation = DebugOperation {
        id: operation_id.clone(),
        operation_type: DebugOperationType::CopyPod,
        pod_name: debug_pod_name,
        container_name,
        namespace: ns,
        created_at,
        timeout_seconds,
    };

    state.debug_operations.insert(operation_id, operation.clone());

    Ok(operation)
}

/// Create a privileged debug pod on a specific node
#[tauri::command]
pub async fn debug_node(
    node_name: String,
    namespace: Option<String>,
    config: DebugConfig,
    state: State<'_, AppState>,
) -> Result<DebugOperation> {
    crate::validation::validate_dns_label(&node_name)?;

    let ctx = ResourceContext::for_command(&state, namespace)?;
    let api: Api<Pod> = ctx.namespaced_api();
    let ns = require_namespace(ctx.namespace.clone(), "default".to_string())?;

    let debug_pod_name = generate_debug_pod_name(&format!("node-{}", node_name));
    let container_name = "debugger".to_string();

    // Build command - default to shell if not specified
    let command = config.command.unwrap_or_else(|| vec!["/bin/sh".to_string()]);

    // Get current timestamp for labels and operation tracking
    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Create labels
    let mut labels = BTreeMap::new();
    labels.insert("k8s-gui/debug-pod".to_string(), "true".to_string());
    labels.insert("k8s-gui/debug-node".to_string(), node_name.clone());
    labels.insert(
        "k8s-gui/created-at".to_string(),
        created_at.to_string(),
    );

    // Create the privileged debug pod
    let debug_pod = Pod {
        metadata: ObjectMeta {
            name: Some(debug_pod_name.clone()),
            namespace: Some(ns.clone()),
            labels: Some(labels),
            ..Default::default()
        },
        spec: Some(PodSpec {
            node_name: Some(node_name),
            host_pid: Some(true),
            host_network: Some(true),
            host_ipc: Some(true),
            containers: vec![Container {
                name: container_name.clone(),
                image: Some(config.image),
                stdin: Some(true),
                tty: Some(true),
                command: Some(command),
                security_context: Some(SecurityContext {
                    privileged: Some(true),
                    ..Default::default()
                }),
                volume_mounts: Some(vec![VolumeMount {
                    name: "host-root".to_string(),
                    mount_path: "/host".to_string(),
                    read_only: Some(false),
                    ..Default::default()
                }]),
                ..Default::default()
            }],
            volumes: Some(vec![Volume {
                name: "host-root".to_string(),
                host_path: Some(HostPathVolumeSource {
                    path: "/".to_string(),
                    type_: Some("Directory".to_string()),
                }),
                ..Default::default()
            }]),
            restart_policy: Some("Never".to_string()),
            // Add TTL - auto-terminate after 1 hour
            active_deadline_seconds: Some(3600),
            // Tolerate all taints to run on any node
            tolerations: Some(vec![Toleration {
                operator: Some("Exists".to_string()),
                ..Default::default()
            }]),
            ..Default::default()
        }),
        ..Default::default()
    };

    // Create the pod
    api.create(&PostParams::default(), &debug_pod).await?;

    // Create and store the debug operation
    let operation_id = format!("debug-{}", uuid::Uuid::new_v4());
    let timeout_seconds = config.timeout_seconds.unwrap_or(120);

    let operation = DebugOperation {
        id: operation_id.clone(),
        operation_type: DebugOperationType::NodeDebug,
        pod_name: debug_pod_name,
        container_name,
        namespace: ns,
        created_at,
        timeout_seconds,
    };

    state.debug_operations.insert(operation_id, operation.clone());

    Ok(operation)
}

/// Delete a debug pod
#[tauri::command]
pub async fn delete_debug_pod(
    pod_name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::validation::validate_dns_label(&pod_name)?;

    let ctx = ResourceContext::for_command(&state, namespace)?;
    let api: Api<Pod> = ctx.namespaced_api();

    // Verify it's a debug pod before deleting
    let pod = api.get(&pod_name).await?;
    let labels = pod.metadata.labels.unwrap_or_default();

    if labels.get("k8s-gui/debug-pod").map(|v| v.as_str()) != Some("true") {
        return Err(Error::InvalidInput(format!(
            "Pod '{}' is not a debug pod created by k8s-gui",
            pod_name
        )));
    }

    // Delete the pod
    api.delete(&pod_name, &Default::default()).await?;

    Ok(())
}

/// List debug pods in a namespace (or all namespaces)
#[tauri::command]
pub async fn list_debug_pods(
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<DebugResult>> {
    let ctx = ResourceContext::for_list(&state, namespace)?;
    let api: Api<Pod> = ctx.namespaced_or_cluster_api();

    let list_params = kube::api::ListParams::default()
        .labels("k8s-gui/debug-pod=true");

    let pods = api.list(&list_params).await?;

    let results: Vec<DebugResult> = pods
        .items
        .iter()
        .filter_map(|pod| {
            let name = pod.metadata.name.clone()?;
            let ns = pod.metadata.namespace.clone().unwrap_or_else(|| "default".to_string());
            let labels = pod.metadata.labels.clone().unwrap_or_default();

            // Find the debugger container name
            let container_name = if labels.get("k8s-gui/debug-node").is_some() {
                "debugger".to_string()
            } else {
                pod.spec
                    .as_ref()
                    .and_then(|s| s.containers.last())
                    .map(|c| c.name.clone())
                    .unwrap_or_else(|| "debugger".to_string())
            };

            Some(DebugResult {
                pod_name: name,
                container_name,
                namespace: ns,
                is_new_pod: true,
            })
        })
        .collect();

    Ok(results)
}

/// Get status of a debug operation
#[tauri::command]
pub async fn get_debug_status(
    operation_id: String,
    state: State<'_, AppState>,
) -> Result<DebugStatus> {
    // Get operation from storage
    let operation = state
        .debug_operations
        .get(&operation_id)
        .map(|r| r.clone())
        .ok_or_else(|| Error::InvalidInput(format!("Operation {} not found", operation_id)))?;

    // Check timeout
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    if now > operation.created_at + operation.timeout_seconds as u64 {
        // Don't remove on timeout - user may choose "Keep Waiting"
        return Ok(DebugStatus::Timeout);
    }

    // Get Kubernetes client using ResourceContext
    let ctx = ResourceContext::for_command(&state, Some(operation.namespace.clone()))?;
    let api: Api<Pod> = Api::namespaced(ctx.client.clone(), &operation.namespace);

    // Get pod status
    let pod = match api.get(&operation.pod_name).await {
        Ok(p) => p,
        Err(kube::Error::Api(e)) if e.code == 404 => {
            state.debug_operations.remove(&operation_id);
            return Ok(DebugStatus::Failed {
                error: "Pod not found".to_string(),
            });
        }
        Err(e) => return Err(Error::from(e)),
    };

    // Check container status based on operation type
    let status = match operation.operation_type {
        DebugOperationType::Ephemeral => {
            check_ephemeral_container_status(&pod, &operation.container_name)
        }
        DebugOperationType::CopyPod | DebugOperationType::NodeDebug => {
            check_container_status(&pod, &operation.container_name)
        }
    };

    // If ready or failed, remove from storage
    match &status {
        DebugStatus::Ready { .. } | DebugStatus::Failed { .. } => {
            state.debug_operations.remove(&operation_id);
        }
        _ => {}
    }

    Ok(status)
}

/// Extend debug operation timeout (for "Keep Waiting" action)
#[tauri::command]
pub async fn extend_debug_timeout(
    operation_id: String,
    additional_seconds: Option<u32>,
    state: State<'_, AppState>,
) -> Result<()> {
    let additional = additional_seconds.unwrap_or(120);

    // Update the operation's created_at to effectively extend the timeout
    if let Some(mut operation) = state.debug_operations.get_mut(&operation_id) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        // Reset created_at to now, so timeout_seconds applies from now
        operation.created_at = now;
        // Optionally update timeout if provided
        if additional_seconds.is_some() {
            operation.timeout_seconds = additional;
        }
        Ok(())
    } else {
        Err(Error::InvalidInput(format!(
            "Operation {} not found",
            operation_id
        )))
    }
}

/// Check ephemeral container status
fn check_ephemeral_container_status(pod: &Pod, container_name: &str) -> DebugStatus {
    let statuses = pod
        .status
        .as_ref()
        .and_then(|s| s.ephemeral_container_statuses.as_ref());

    let container_status = statuses.and_then(|list| list.iter().find(|c| c.name == container_name));

    match container_status {
        None => DebugStatus::Pending {
            reason: "Container not yet created".to_string(),
        },
        Some(cs) => {
            if let Some(ref state) = cs.state {
                if state.running.is_some() {
                    let ns = pod.metadata.namespace.clone().unwrap_or_default();
                    let pod_name = pod.metadata.name.clone().unwrap_or_default();
                    return DebugStatus::Ready {
                        result: DebugResult {
                            pod_name,
                            container_name: container_name.to_string(),
                            namespace: ns,
                            is_new_pod: false,
                        },
                    };
                }
                if let Some(ref waiting) = state.waiting {
                    let reason = waiting
                        .reason
                        .clone()
                        .unwrap_or_else(|| "Waiting".to_string());
                    if reason.contains("ImagePull") && reason.contains("Back") {
                        return DebugStatus::Failed {
                            error: format!("Image pull failed: {}", reason),
                        };
                    }
                    if reason.contains("Err") {
                        return DebugStatus::Failed {
                            error: waiting.message.clone().unwrap_or(reason),
                        };
                    }
                    return DebugStatus::Pending { reason };
                }
                if let Some(ref terminated) = state.terminated {
                    let reason = terminated
                        .reason
                        .clone()
                        .unwrap_or_else(|| "Terminated".to_string());
                    return DebugStatus::Failed {
                        error: format!("Container terminated: {}", reason),
                    };
                }
            }
            DebugStatus::Pending {
                reason: "Unknown state".to_string(),
            }
        }
    }
}

/// Check regular container status
fn check_container_status(pod: &Pod, container_name: &str) -> DebugStatus {
    // First check pod phase
    let phase = pod
        .status
        .as_ref()
        .and_then(|s| s.phase.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("Unknown");

    match phase {
        "Failed" => {
            let reason = pod
                .status
                .as_ref()
                .and_then(|s| s.reason.clone())
                .unwrap_or_else(|| "Pod failed".to_string());
            return DebugStatus::Failed { error: reason };
        }
        "Succeeded" => {
            return DebugStatus::Failed {
                error: "Pod completed".to_string(),
            };
        }
        "Pending" => {
            let reason = get_pending_reason(pod);
            return DebugStatus::Pending { reason };
        }
        _ => {}
    }

    // Check container statuses
    let statuses = pod
        .status
        .as_ref()
        .and_then(|s| s.container_statuses.as_ref());

    let container_status = statuses.and_then(|list| list.iter().find(|c| c.name == container_name));

    match container_status {
        None => DebugStatus::Pending {
            reason: "Container not yet created".to_string(),
        },
        Some(cs) => {
            if let Some(ref state) = cs.state {
                if state.running.is_some() {
                    let ns = pod.metadata.namespace.clone().unwrap_or_default();
                    let pod_name = pod.metadata.name.clone().unwrap_or_default();
                    return DebugStatus::Ready {
                        result: DebugResult {
                            pod_name,
                            container_name: container_name.to_string(),
                            namespace: ns,
                            is_new_pod: true,
                        },
                    };
                }
                if let Some(ref waiting) = state.waiting {
                    let reason = waiting
                        .reason
                        .clone()
                        .unwrap_or_else(|| "Waiting".to_string());
                    if reason.contains("ImagePull") && reason.contains("Back") {
                        return DebugStatus::Failed {
                            error: format!("Image pull failed: {}", reason),
                        };
                    }
                    if reason.contains("Err") || reason.contains("CrashLoop") {
                        return DebugStatus::Failed {
                            error: waiting.message.clone().unwrap_or(reason),
                        };
                    }
                    return DebugStatus::Pending { reason };
                }
                if let Some(ref terminated) = state.terminated {
                    let reason = terminated
                        .reason
                        .clone()
                        .unwrap_or_else(|| "Terminated".to_string());
                    return DebugStatus::Failed {
                        error: format!("Container terminated: {}", reason),
                    };
                }
            }
            DebugStatus::Pending {
                reason: "Unknown state".to_string(),
            }
        }
    }
}

/// Get reason for pending pod
fn get_pending_reason(pod: &Pod) -> String {
    if let Some(status) = &pod.status {
        if let Some(conditions) = &status.conditions {
            for cond in conditions {
                if cond.status == "False" {
                    if let Some(reason) = &cond.reason {
                        return reason.clone();
                    }
                }
            }
        }
        if let Some(statuses) = &status.container_statuses {
            for cs in statuses {
                if let Some(state) = &cs.state {
                    if let Some(waiting) = &state.waiting {
                        return waiting
                            .reason
                            .clone()
                            .unwrap_or_else(|| "Waiting".to_string());
                    }
                }
            }
        }
    }
    "Scheduling".to_string()
}

/// Cancel a debug operation and cleanup resources
#[tauri::command]
pub async fn cancel_debug_operation(
    operation_id: String,
    state: State<'_, AppState>,
) -> Result<()> {
    // Get and remove operation from storage
    let operation = state
        .debug_operations
        .remove(&operation_id)
        .map(|(_, op)| op)
        .ok_or_else(|| Error::InvalidInput(format!("Operation {} not found", operation_id)))?;

    // For CopyPod and NodeDebug, delete the created pod
    match operation.operation_type {
        DebugOperationType::CopyPod | DebugOperationType::NodeDebug => {
            let ctx = ResourceContext::for_command(&state, Some(operation.namespace.clone()))?;
            let api: Api<Pod> = ctx.namespaced_api();

            // Delete the pod, ignore if not found
            match api.delete(&operation.pod_name, &Default::default()).await {
                Ok(_) => {}
                Err(kube::Error::Api(e)) if e.code == 404 => {}
                Err(e) => return Err(Error::from(e)),
            }
        }
        DebugOperationType::Ephemeral => {
            // Cannot remove ephemeral container, it will be cleaned up with the pod
        }
    }

    Ok(())
}
