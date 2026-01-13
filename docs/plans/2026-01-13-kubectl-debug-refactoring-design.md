# kubectl debug Refactoring Design

**Date:** 2026-01-13
**Status:** Approved

## Problem Statement

Current kubectl debug implementation has bugs in all major modes:
- Ephemeral container creation fails or doesn't connect
- Terminal doesn't connect after debug container creation
- Debug pods don't delete correctly / "hanging" pods remain
- Copy Pod mode issues (pod doesn't start, incorrect configuration)

**Root cause:** No waiting for container readiness. After creating debug container/pod, code immediately returns result and frontend tries to connect, but container may still be in Waiting/Pending state.

## Solution Overview

Implement polling-based approach:
1. Backend creates debug resource and returns operation ID immediately
2. Frontend polls for status every 2 seconds
3. Terminal connects only after container is Ready
4. Configurable timeout with user choice on timeout

## Architecture and Data Flow

```
Frontend                         Backend                          Kubernetes
   │                                │                                  │
   │ debug_pod_ephemeral()          │                                  │
   ├───────────────────────────────►│ create ephemeral container       │
   │                                ├─────────────────────────────────►│
   │  DebugOperation { id, status } │                                  │
   │◄───────────────────────────────┤  (returns immediately)           │
   │                                │                                  │
   │ get_debug_status(id)           │                                  │
   ├───────────────────────────────►│ check container state            │
   │                                ├─────────────────────────────────►│
   │  DebugStatus::Pending          │◄─────────────────────────────────┤
   │◄───────────────────────────────┤                                  │
   │                                │                                  │
   │  ... polling every 2 sec ...   │                                  │
   │                                │                                  │
   │ get_debug_status(id)           │                                  │
   ├───────────────────────────────►│ check container state            │
   │                                ├─────────────────────────────────►│
   │  DebugStatus::Ready { result } │◄─────────────────────────────────┤
   │◄───────────────────────────────┤                                  │
   │                                │                                  │
   │ open_shell(result)             │                                  │
   └───────────────────────────────►│  (terminal connects)             │
```

## Data Structures (Backend)

### New Types in `debug.rs`

```rust
/// Debug container creation operation
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DebugOperationType {
    Ephemeral,
    CopyPod,
    NodeDebug,
}

/// Operation status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DebugStatus {
    /// Waiting (with reason: Scheduling, PullingImage, ContainerCreating)
    Pending { reason: String },
    /// Ready to connect
    Ready { result: DebugResult },
    /// Error (container failed to start)
    Failed { error: String },
    /// Waiting timeout exceeded
    Timeout,
}
```

### Storage (in-memory)

```rust
// Add to AppState:
pub debug_operations: DashMap<String, DebugOperation>,
```

Operations stored in memory, cleared on completion (Ready/Failed/Timeout) or app restart.

**Rationale for in-memory:** Debug operations are ephemeral polling data (live 2-120 sec). Persistent storage unnecessary. Debug pods tracked via Kubernetes labels (`k8s-gui/debug-pod=true`).

## API Commands (Backend)

### Modified Commands

```rust
/// Create ephemeral debug container (returns operation, not result)
#[tauri::command]
pub async fn debug_pod_ephemeral(
    pod_name: String,
    namespace: Option<String>,
    config: DebugConfig,
    state: State<'_, AppState>,
) -> Result<DebugOperation>

/// Same for copy and node
pub async fn debug_pod_copy(...) -> Result<DebugOperation>
pub async fn debug_node(...) -> Result<DebugOperation>
```

### New Commands

```rust
/// Get debug operation status
#[tauri::command]
pub async fn get_debug_status(
    operation_id: String,
    state: State<'_, AppState>,
) -> Result<DebugStatus>

/// Cancel operation and delete created resource
#[tauri::command]
pub async fn cancel_debug_operation(
    operation_id: String,
    state: State<'_, AppState>,
) -> Result<()>
```

### `get_debug_status` Logic

1. Find operation by ID
2. Check timeout (created_at + timeout_seconds < now)
3. Query container state from K8s API
4. For ephemeral: `pod.status.ephemeralContainerStatuses`
5. For copy/node: `pod.status.containerStatuses`
6. Return Pending/Ready/Failed/Timeout

### DebugConfig Changes

```rust
pub struct DebugConfig {
    // ... existing fields ...
    /// Readiness timeout (seconds), default 120
    pub timeout_seconds: Option<u32>,
}
```

## TTL and PodSpec Changes

### Adding `activeDeadlineSeconds` to debug pods

```rust
// In debug_pod_copy() and debug_node()
spec: Some(PodSpec {
    // ... existing fields ...

    // TTL: pod auto-terminates after 1 hour
    active_deadline_seconds: Some(3600),

    restart_policy: Some("Never".to_string()),
    // ...
})
```

**Why 3600 (1 hour):**
- Sufficient for most debug sessions
- Not too long for garbage accumulation
- User can delete earlier via UI

**For ephemeral containers:**
- TTL not applicable (container lives with pod)
- OK — ephemeral doesn't create "garbage", it's part of existing pod

### Additional Labels

```rust
labels.insert("k8s-gui/debug-pod".to_string(), "true".to_string());
labels.insert("k8s-gui/created-at".to_string(), timestamp.to_string());
labels.insert("k8s-gui/ttl-seconds".to_string(), "3600".to_string());
```

### Recovery on App Start

- On initialization call `list_debug_pods()`
- If pods created < 5 minutes ago exist — show toast notification

## Frontend Changes

### New Hook `useDebugOperation`

```typescript
interface UseDebugOperationOptions {
  onReady: (result: DebugResult) => void;
  onError: (error: string) => void;
  onTimeout: () => void;
  pollInterval?: number; // default 2000ms
}

function useDebugOperation(options: UseDebugOperationOptions) {
  const [operation, setOperation] = useState<DebugOperation | null>(null);
  const [status, setStatus] = useState<DebugStatus | null>(null);

  const start = async (
    mode: 'ephemeral' | 'copy' | 'node',
    params: DebugParams
  ) => { /* start operation */ };

  const cancel = async () => { /* cancel and cleanup */ };

  // Polling logic inside
  useEffect(() => { /* poll get_debug_status every 2 sec */ }, [operation]);

  return { operation, status, start, cancel };
}
```

### Changes in `DebugPodDialog`

```typescript
const { operation, status, start, cancel } = useDebugOperation({
  onReady: (result) => {
    onDebugStart(result);
    onOpenChange(false);
  },
  onTimeout: () => setShowTimeoutDialog(true),
  onError: (err) => toast({ title: "Debug failed", description: err }),
});

// UI states:
// - isLoading=false, operation=null → input form
// - operation!=null, status=Pending → progress with reason
// - status=Timeout → choice dialog (Keep waiting / Delete / Leave)
```

### Progress UI in Dialog

```
┌─────────────────────────────────────┐
│ Debug Pod                           │
├─────────────────────────────────────┤
│ ⏳ Creating debug container...      │
│                                     │
│ Status: Pulling image               │
│ Elapsed: 15s / 120s                 │
│                                     │
│ [Cancel]                            │
└─────────────────────────────────────┘
```

## Timeout Dialog and Cleanup UI

### Timeout Dialog

```
┌─────────────────────────────────────────┐
│ Debug Container Not Ready               │
├─────────────────────────────────────────┤
│ ⚠️ Container didn't become ready        │
│ within 120 seconds.                     │
│                                         │
│ Status: PullingImage                    │
│ Pod: nginx-debug-1705123456             │
│                                         │
│ What would you like to do?              │
│                                         │
│ [Keep Waiting]  [Delete Pod]  [Leave]   │
└─────────────────────────────────────────┘
```

**Actions:**
- **Keep Waiting** — continue polling for another 120 sec
- **Delete Pod** — call `cancel_debug_operation`, close dialog
- **Leave** — close dialog, pod remains (can be found in list)

### Toast on Debug Pod Terminal Close

```typescript
const handleTerminalClose = () => {
  if (isDebugPod) {
    toast({
      title: "Debug pod still running",
      description: "Delete when done to free resources",
      action: (
        <Button size="sm" onClick={() => deleteDebugPod(podName, namespace)}>
          Delete Now
        </Button>
      ),
      duration: 8000,
    });
  }
};
```

### Debug Pods List Improvements

- Show remaining time until TTL
- Bulk delete: "Delete all debug pods"

## Error Handling and Edge Cases

### Container State Handling

| Container State | Reason | DebugStatus | Action |
|----------------|--------|-------------|--------|
| Waiting | ContainerCreating | Pending | Continue polling |
| Waiting | PullingImage | Pending | Continue polling |
| Waiting | ErrImagePull | Failed | Show error |
| Waiting | ImagePullBackOff | Failed | Show error |
| Waiting | CrashLoopBackOff | Failed | Show error |
| Running | - | Ready | Success, return result |
| Terminated | Error | Failed | Show exit code |
| Terminated | Completed | Failed | Container finished |

### Copy/Node Pods — Additional Checks

```rust
match pod.status.phase.as_deref() {
    Some("Pending") => DebugStatus::Pending { reason: get_pending_reason(&pod) },
    Some("Running") => check_container_status(&pod, &container_name),
    Some("Failed") => DebugStatus::Failed { error: get_failure_reason(&pod) },
    Some("Succeeded") => DebugStatus::Failed { error: "Pod completed".into() },
    _ => DebugStatus::Pending { reason: "Unknown".into() },
}
```

### Edge Cases

1. **Pod deleted externally** — get_debug_status returns Failed with "Pod not found"
2. **Network error during polling** — retry with same interval, don't count as failure
3. **App restart during polling** — operation lost, user finds pod via list
4. **Multiple operations** — each has own ID, independent polling

### Operation Cleanup from Memory

- On Ready/Failed/Timeout — remove from `debug_operations`
- On `cancel_debug_operation` — remove from map + delete K8s resource

## Configuration Summary

| Parameter | Value | Notes |
|-----------|-------|-------|
| Default timeout | 120 seconds | User configurable in dialog |
| Poll interval | 2 seconds | Fixed |
| Pod TTL | 3600 seconds (1 hour) | Via activeDeadlineSeconds |
| Recovery threshold | 5 minutes | Show notification for recent debug pods |

## Files to Modify

### Backend (Rust)
- `src-tauri/src/commands/debug.rs` — main changes
- `src-tauri/src/state.rs` — add debug_operations to AppState
- `src-tauri/src/lib.rs` — register new commands

### Frontend (TypeScript)
- `src/hooks/useDebugOperation.ts` — new hook
- `src/components/debug/DebugPodDialog.tsx` — polling UI
- `src/components/debug/DebugNodeDialog.tsx` — polling UI
- `src/components/debug/TimeoutDialog.tsx` — new component
- `src/components/terminal/Terminal.tsx` — cleanup toast
- `src/generated/types.ts` — new types (auto-generated)
