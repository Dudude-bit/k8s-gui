# kubectl debug Refactoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix debug functionality bugs by implementing polling-based container readiness checking before terminal connection.

**Architecture:** Backend creates debug resources and returns operation ID immediately. Frontend polls `get_debug_status` every 2 seconds until Ready/Failed/Timeout. Terminal connects only after container is Running.

**Tech Stack:** Rust (Tauri backend), TypeScript/React (frontend), kube-rs (K8s client), zustand (state management)

---

## Task 1: Add Debug Operations Storage to AppState

**Files:**
- Modify: `src-tauri/src/state.rs`

**Step 1: Add DashMap import and debug_operations field**

Add to imports at top of file:
```rust
use dashmap::DashMap;
```

Add to `AppState` struct:
```rust
pub debug_operations: DashMap<String, crate::commands::debug::DebugOperation>,
```

**Step 2: Initialize debug_operations in AppState::new()**

Find the `AppState` constructor and add:
```rust
debug_operations: DashMap::new(),
```

**Step 3: Verify compilation**

Run: `cargo check`
Expected: Compilation succeeds (may have warnings)

**Step 4: Commit**

```bash
git add src-tauri/src/state.rs
git commit -m "feat(debug): add debug_operations storage to AppState"
```

---

## Task 2: Add New Debug Types

**Files:**
- Modify: `src-tauri/src/commands/debug.rs`

**Step 1: Add new types after existing DebugResult struct**

Add after line ~51 (after `DebugResult` struct):

```rust
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
```

**Step 2: Update DebugConfig to add timeout_seconds**

Find `DebugConfig` struct and add field:
```rust
/// Timeout waiting for container readiness (seconds), default 120
pub timeout_seconds: Option<u32>,
```

**Step 3: Verify compilation**

Run: `cargo check`
Expected: Compilation succeeds

**Step 4: Commit**

```bash
git add src-tauri/src/commands/debug.rs
git commit -m "feat(debug): add DebugOperation, DebugStatus types"
```

---

## Task 3: Refactor debug_pod_ephemeral to Return Operation

**Files:**
- Modify: `src-tauri/src/commands/debug.rs`

**Step 1: Change return type and implementation**

Replace the entire `debug_pod_ephemeral` function:

```rust
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
    let operation_id = format!("debug-{}", uuid::Uuid::new_v4());

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

    let timeout_seconds = config.timeout_seconds.unwrap_or(120);
    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let operation = DebugOperation {
        id: operation_id.clone(),
        operation_type: DebugOperationType::Ephemeral,
        pod_name,
        container_name,
        namespace: ns,
        created_at,
        timeout_seconds,
    };

    // Store operation for status polling
    state.debug_operations.insert(operation_id, operation.clone());

    Ok(operation)
}
```

**Step 2: Add uuid to imports at top of file**

Check if uuid is already imported, if not add usage. The uuid crate should already be available via Tauri.

**Step 3: Verify compilation**

Run: `cargo check`
Expected: Compilation succeeds

**Step 4: Commit**

```bash
git add src-tauri/src/commands/debug.rs
git commit -m "refactor(debug): debug_pod_ephemeral returns DebugOperation"
```

---

## Task 4: Refactor debug_pod_copy to Return Operation

**Files:**
- Modify: `src-tauri/src/commands/debug.rs`

**Step 1: Change return type and add TTL**

Replace the entire `debug_pod_copy` function:

```rust
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
    let operation_id = format!("debug-{}", uuid::Uuid::new_v4());

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

    // TTL: pod auto-terminates after 1 hour
    new_spec.active_deadline_seconds = Some(3600);

    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Create labels for the debug pod
    let mut labels = BTreeMap::new();
    labels.insert("k8s-gui/debug-pod".to_string(), "true".to_string());
    labels.insert("k8s-gui/debug-source".to_string(), pod_name.clone());
    labels.insert("k8s-gui/created-at".to_string(), created_at.to_string());

    // Create the debug pod
    let debug_pod = Pod {
        metadata: ObjectMeta {
            name: Some(debug_pod_name.clone()),
            namespace: Some(ns.clone()),
            labels: Some(labels),
            ..Default::default()
        },
        spec: Some(new_spec),
        ..Default::default()
    };

    // Create the pod
    api.create(&PostParams::default(), &debug_pod).await?;

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

    // Store operation for status polling
    state.debug_operations.insert(operation_id, operation.clone());

    Ok(operation)
}
```

**Step 2: Verify compilation**

Run: `cargo check`
Expected: Compilation succeeds

**Step 3: Commit**

```bash
git add src-tauri/src/commands/debug.rs
git commit -m "refactor(debug): debug_pod_copy returns DebugOperation with TTL"
```

---

## Task 5: Refactor debug_node to Return Operation

**Files:**
- Modify: `src-tauri/src/commands/debug.rs`

**Step 1: Change return type and add TTL**

Replace the entire `debug_node` function:

```rust
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
    let operation_id = format!("debug-{}", uuid::Uuid::new_v4());

    // Build command - default to shell if not specified
    let command = config.command.unwrap_or_else(|| vec!["/bin/sh".to_string()]);

    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Create labels
    let mut labels = BTreeMap::new();
    labels.insert("k8s-gui/debug-pod".to_string(), "true".to_string());
    labels.insert("k8s-gui/debug-node".to_string(), node_name.clone());
    labels.insert("k8s-gui/created-at".to_string(), created_at.to_string());

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
            // TTL: pod auto-terminates after 1 hour
            active_deadline_seconds: Some(3600),
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

    // Store operation for status polling
    state.debug_operations.insert(operation_id, operation.clone());

    Ok(operation)
}
```

**Step 2: Verify compilation**

Run: `cargo check`
Expected: Compilation succeeds

**Step 3: Commit**

```bash
git add src-tauri/src/commands/debug.rs
git commit -m "refactor(debug): debug_node returns DebugOperation with TTL"
```

---

## Task 6: Add get_debug_status Command

**Files:**
- Modify: `src-tauri/src/commands/debug.rs`

**Step 1: Add the get_debug_status function**

Add after `debug_node` function:

```rust
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
        // Remove from storage on timeout
        state.debug_operations.remove(&operation_id);
        return Ok(DebugStatus::Timeout);
    }

    // Get Kubernetes client
    let client = state.kube_client.read().await;
    let client = client
        .as_ref()
        .ok_or_else(|| Error::Internal("No Kubernetes client available".to_string()))?;

    let api: Api<Pod> = Api::namespaced(client.clone(), &operation.namespace);

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

/// Check ephemeral container status
fn check_ephemeral_container_status(pod: &Pod, container_name: &str) -> DebugStatus {
    let statuses = pod
        .status
        .as_ref()
        .and_then(|s| s.ephemeral_container_statuses.as_ref());

    let container_status = statuses
        .and_then(|list| list.iter().find(|c| c.name == container_name));

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
                    let reason = waiting.reason.clone().unwrap_or_else(|| "Waiting".to_string());
                    // Check for failure conditions
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
                    let reason = terminated.reason.clone().unwrap_or_else(|| "Terminated".to_string());
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
            // Check conditions for more details
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

    let container_status = statuses
        .and_then(|list| list.iter().find(|c| c.name == container_name));

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
                    let reason = waiting.reason.clone().unwrap_or_else(|| "Waiting".to_string());
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
                    let reason = terminated.reason.clone().unwrap_or_else(|| "Terminated".to_string());
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
        // Check conditions
        if let Some(conditions) = &status.conditions {
            for cond in conditions {
                if cond.status == "False" {
                    if let Some(reason) = &cond.reason {
                        return reason.clone();
                    }
                }
            }
        }
        // Check container statuses for waiting reason
        if let Some(statuses) = &status.container_statuses {
            for cs in statuses {
                if let Some(state) = &cs.state {
                    if let Some(waiting) = &state.waiting {
                        return waiting.reason.clone().unwrap_or_else(|| "Waiting".to_string());
                    }
                }
            }
        }
    }
    "Scheduling".to_string()
}
```

**Step 2: Verify compilation**

Run: `cargo check`
Expected: Compilation succeeds

**Step 3: Commit**

```bash
git add src-tauri/src/commands/debug.rs
git commit -m "feat(debug): add get_debug_status command for polling"
```

---

## Task 7: Add cancel_debug_operation Command

**Files:**
- Modify: `src-tauri/src/commands/debug.rs`

**Step 1: Add the cancel_debug_operation function**

Add after `get_debug_status` function:

```rust
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
            let client = state.kube_client.read().await;
            let client = client
                .as_ref()
                .ok_or_else(|| Error::Internal("No Kubernetes client available".to_string()))?;

            let api: Api<Pod> = Api::namespaced(client.clone(), &operation.namespace);

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
```

**Step 2: Verify compilation**

Run: `cargo check`
Expected: Compilation succeeds

**Step 3: Commit**

```bash
git add src-tauri/src/commands/debug.rs
git commit -m "feat(debug): add cancel_debug_operation command"
```

---

## Task 8: Register New Commands in main.rs

**Files:**
- Modify: `src-tauri/src/main.rs`

**Step 1: Find the invoke_handler and add new commands**

Search for `invoke_handler` in main.rs and add the new commands to the list:
- `get_debug_status`
- `cancel_debug_operation`

The commands should already be exported from `commands::debug`, just need to add them to the handler list.

**Step 2: Verify compilation**

Run: `cargo build`
Expected: Compilation succeeds

**Step 3: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat(debug): register new debug status commands"
```

---

## Task 9: Generate TypeScript Types

**Files:**
- Auto-generated: `src/generated/types.ts`

**Step 1: Run type generation**

Run: `npm run generate-types` (or equivalent command for this project)

If no type generation script exists, manually add types to appropriate location.

**Step 2: Verify types are generated**

Check that `DebugOperation`, `DebugOperationType`, and `DebugStatus` types exist in TypeScript.

**Step 3: Commit if types changed**

```bash
git add src/generated/types.ts
git commit -m "chore: regenerate TypeScript types for debug"
```

---

## Task 10: Create useDebugOperation Hook

**Files:**
- Create: `src/hooks/useDebugOperation.ts`

**Step 1: Create the hook file**

```typescript
import { useState, useRef, useCallback, useEffect } from "react";
import { commands } from "@/lib/commands";
import type { DebugConfig, DebugOperation, DebugResult, DebugStatus } from "@/generated/types";

export type DebugOperationState = "idle" | "creating" | "polling" | "ready" | "failed" | "timeout";

interface UseDebugOperationOptions {
  onReady: (result: DebugResult) => void;
  onError: (error: string) => void;
  onTimeout: (operation: DebugOperation) => void;
  pollInterval?: number;
}

export function useDebugOperation({
  onReady,
  onError,
  onTimeout,
  pollInterval = 2000,
}: UseDebugOperationOptions) {
  const [state, setState] = useState<DebugOperationState>("idle");
  const [operation, setOperation] = useState<DebugOperation | null>(null);
  const [statusReason, setStatusReason] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback((op: DebugOperation) => {
    cleanup();
    isCancelledRef.current = false;
    setElapsedSeconds(0);

    // Elapsed time counter
    elapsedIntervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    // Status polling
    const poll = async () => {
      if (isCancelledRef.current) return;

      try {
        const status = await commands.getDebugStatus(op.id);

        if (isCancelledRef.current) return;

        if (status.type === "Ready") {
          cleanup();
          setState("ready");
          onReady(status.result);
        } else if (status.type === "Failed") {
          cleanup();
          setState("failed");
          onError(status.error);
        } else if (status.type === "Timeout") {
          cleanup();
          setState("timeout");
          onTimeout(op);
        } else if (status.type === "Pending") {
          setStatusReason(status.reason);
        }
      } catch (err) {
        console.error("Failed to get debug status:", err);
        // Don't fail on transient errors, keep polling
      }
    };

    // Initial poll
    poll();

    // Subsequent polls
    pollIntervalRef.current = setInterval(poll, pollInterval);
  }, [cleanup, pollInterval, onReady, onError, onTimeout]);

  const startEphemeral = useCallback(
    async (podName: string, namespace: string, config: DebugConfig) => {
      setState("creating");
      setStatusReason(null);
      isCancelledRef.current = false;

      try {
        const op = await commands.debugPodEphemeral(podName, namespace, config);
        setOperation(op);
        setState("polling");
        startPolling(op);
      } catch (err) {
        setState("failed");
        onError(String(err));
      }
    },
    [startPolling, onError]
  );

  const startCopyPod = useCallback(
    async (podName: string, namespace: string, config: DebugConfig) => {
      setState("creating");
      setStatusReason(null);
      isCancelledRef.current = false;

      try {
        const op = await commands.debugPodCopy(podName, namespace, config);
        setOperation(op);
        setState("polling");
        startPolling(op);
      } catch (err) {
        setState("failed");
        onError(String(err));
      }
    },
    [startPolling, onError]
  );

  const startNodeDebug = useCallback(
    async (nodeName: string, namespace: string, config: DebugConfig) => {
      setState("creating");
      setStatusReason(null);
      isCancelledRef.current = false;

      try {
        const op = await commands.debugNode(nodeName, namespace, config);
        setOperation(op);
        setState("polling");
        startPolling(op);
      } catch (err) {
        setState("failed");
        onError(String(err));
      }
    },
    [startPolling, onError]
  );

  const cancel = useCallback(async () => {
    isCancelledRef.current = true;
    cleanup();

    if (operation) {
      try {
        await commands.cancelDebugOperation(operation.id);
      } catch (err) {
        console.error("Failed to cancel debug operation:", err);
      }
    }

    setOperation(null);
    setState("idle");
    setStatusReason(null);
    setElapsedSeconds(0);
  }, [operation, cleanup]);

  const continueWaiting = useCallback(() => {
    if (operation) {
      setState("polling");
      startPolling(operation);
    }
  }, [operation, startPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isCancelledRef.current = true;
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    operation,
    statusReason,
    elapsedSeconds,
    startEphemeral,
    startCopyPod,
    startNodeDebug,
    cancel,
    continueWaiting,
  };
}
```

**Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: Compilation succeeds (or only unrelated errors)

**Step 3: Commit**

```bash
git add src/hooks/useDebugOperation.ts
git commit -m "feat(debug): add useDebugOperation hook for polling"
```

---

## Task 11: Update DebugPodDialog with Polling UI

**Files:**
- Modify: `src/components/debug/DebugPodDialog.tsx`

**Step 1: Replace the dialog implementation**

This is a larger change - replace the entire file content with the new implementation that uses `useDebugOperation` hook and shows progress/timeout UI.

Key changes:
- Import and use `useDebugOperation` hook
- Add progress UI showing elapsed time and status reason
- Add timeout dialog with Keep Waiting / Delete / Leave options
- Add configurable timeout field

**Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: Compilation succeeds

**Step 3: Commit**

```bash
git add src/components/debug/DebugPodDialog.tsx
git commit -m "feat(debug): update DebugPodDialog with polling UI"
```

---

## Task 12: Update DebugNodeDialog with Polling UI

**Files:**
- Modify: `src/components/debug/DebugNodeDialog.tsx`

Similar changes as Task 11 but for node debug dialog.

**Step 1: Update the dialog to use useDebugOperation hook**

**Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: Compilation succeeds

**Step 3: Commit**

```bash
git add src/components/debug/DebugNodeDialog.tsx
git commit -m "feat(debug): update DebugNodeDialog with polling UI"
```

---

## Task 13: Add Commands to lib/commands.ts

**Files:**
- Modify: `src/lib/commands.ts`

**Step 1: Add new command wrappers**

Add the following command wrappers:

```typescript
export async function getDebugStatus(operationId: string): Promise<DebugStatus> {
  return invoke("get_debug_status", { operationId });
}

export async function cancelDebugOperation(operationId: string): Promise<void> {
  return invoke("cancel_debug_operation", { operationId });
}
```

**Step 2: Update existing debug commands return types**

Change `debugPodEphemeral`, `debugPodCopy`, `debugNode` return types from `DebugResult` to `DebugOperation`.

**Step 3: Verify TypeScript compilation**

Run: `npm run build`
Expected: Compilation succeeds

**Step 4: Commit**

```bash
git add src/lib/commands.ts
git commit -m "feat(debug): add new debug status commands to frontend"
```

---

## Task 14: Full Build and Test

**Step 1: Build frontend**

Run: `npm run build`
Expected: Build succeeds

**Step 2: Build backend**

Run: `cd src-tauri && cargo build`
Expected: Build succeeds

**Step 3: Run the app (manual test)**

Run: `npm run tauri dev`

Test scenarios:
1. Create ephemeral debug container - verify polling UI shows, connects when ready
2. Create copy pod debug - verify polling UI, new pod created with TTL
3. Cancel during polling - verify cleanup works
4. Test timeout scenario (use very short timeout like 5 sec with slow image)

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(debug): address issues found during testing"
```

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Add debug_operations to AppState | state.rs |
| 2 | Add new debug types | debug.rs |
| 3 | Refactor debug_pod_ephemeral | debug.rs |
| 4 | Refactor debug_pod_copy | debug.rs |
| 5 | Refactor debug_node | debug.rs |
| 6 | Add get_debug_status | debug.rs |
| 7 | Add cancel_debug_operation | debug.rs |
| 8 | Register commands | main.rs |
| 9 | Generate TypeScript types | generated/types.ts |
| 10 | Create useDebugOperation hook | hooks/useDebugOperation.ts |
| 11 | Update DebugPodDialog | debug/DebugPodDialog.tsx |
| 12 | Update DebugNodeDialog | debug/DebugNodeDialog.tsx |
| 13 | Add frontend commands | lib/commands.ts |
| 14 | Full build and test | - |
