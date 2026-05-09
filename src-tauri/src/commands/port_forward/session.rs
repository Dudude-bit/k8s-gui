//! Live port-forward sessions: bind a local TCP port, accept
//! connections, copy bytes through `kube::Api::portforward`. Owns
//! the `PortForwardCleanup` Drop guard that ensures the session and
//! control map entries are removed on every exit including
//! panic-unwind.

use crate::commands::helpers::ResourceContext;
use crate::error::{Error, Result};
use crate::state::{AppEvent, AppState, PortForwardSession};
use crate::utils::require_namespace;
use dashmap::DashMap;
use kube::Api;
use std::sync::Arc;
use tauri::State;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::time::{sleep, Duration};

use super::types::{emit_port_forward_status, PortForwardRequest, PortForwardSessionInfo};

/// RAII guard that removes a port-forward's entries from both the
/// session and control maps when dropped — including on panic-unwind
/// inside the spawned listener task. Without this, a panic in
/// `listener.accept()` (or anywhere else in the outer loop) leaves
/// orphaned entries in `state.port_forward_sessions` /
/// `state.port_forward_controls` forever. Mirrors the LogStreamCleanup
/// pattern in commands/logs.rs.
struct PortForwardCleanup {
    sessions: Arc<DashMap<String, PortForwardSession>>,
    controls: Arc<DashMap<String, oneshot::Sender<()>>>,
    key: String,
}

impl Drop for PortForwardCleanup {
    fn drop(&mut self) {
        self.sessions.remove(&self.key);
        self.controls.remove(&self.key);
    }
}

#[allow(clippy::too_many_arguments)]
async fn forward_connection(
    pod: String,
    namespace: String,
    remote_port: u16,
    local_port: u16,
    auto_reconnect: bool,
    client: kube::Client,
    mut local_stream: tokio::net::TcpStream,
    event_tx: tokio::sync::broadcast::Sender<AppEvent>,
    session_id: String,
) {
    let ctx = ResourceContext::from_client(client, namespace.clone());
    let pod_api: Api<k8s_openapi::api::core::v1::Pod> = ctx.namespaced_api();
    let mut attempt: u32 = 0;

    loop {
        match pod_api.portforward(&pod, &[remote_port]).await {
            Ok(mut portforwarder) => {
                if attempt > 0 {
                    emit_port_forward_status(
                        &event_tx,
                        &session_id,
                        &pod,
                        &namespace,
                        local_port,
                        remote_port,
                        "reconnected",
                        None,
                        Some(attempt),
                    );
                }

                if let Some(mut remote_stream) = portforwarder.take_stream(remote_port) {
                    let _ =
                        tokio::io::copy_bidirectional(&mut local_stream, &mut remote_stream).await;
                } else {
                    emit_port_forward_status(
                        &event_tx,
                        &session_id,
                        &pod,
                        &namespace,
                        local_port,
                        remote_port,
                        "error",
                        Some("Failed to open port forward stream".to_string()),
                        None,
                    );
                }

                break;
            }
            Err(err) => {
                if !auto_reconnect {
                    emit_port_forward_status(
                        &event_tx,
                        &session_id,
                        &pod,
                        &namespace,
                        local_port,
                        remote_port,
                        "error",
                        Some(format!("Port-forward failed: {err}")),
                        None,
                    );
                    break;
                }

                attempt += 1;
                let backoff = Duration::from_secs(u64::from(attempt).min(10));
                emit_port_forward_status(
                    &event_tx,
                    &session_id,
                    &pod,
                    &namespace,
                    local_port,
                    remote_port,
                    "reconnecting",
                    Some(format!("Retry in {}s", backoff.as_secs())),
                    Some(attempt),
                );
                sleep(backoff).await;
            }
        }
    }
}

/// Start port forwarding to a pod
#[tauri::command]
pub async fn port_forward_pod(
    pod: String,
    namespace: Option<String>,
    config: PortForwardRequest,
    state: State<'_, AppState>,
) -> Result<PortForwardSessionInfo> {
    if config.local_port == 0 || config.remote_port == 0 {
        return Err(Error::InvalidInput(
            "Ports must be greater than 0".to_string(),
        ));
    }

    let context = state
        .get_current_context()
        .ok_or_else(|| Error::Internal(crate::error::messages::NO_CLUSTER.to_string()))?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| Error::Internal(crate::error::messages::NO_CLIENT.to_string()))?;

    let namespace = require_namespace(namespace, String::new())?;

    let listener = TcpListener::bind(("127.0.0.1", config.local_port))
        .await
        .map_err(|e| {
            Error::Connection(format!("Failed to bind port {}: {e}", config.local_port))
        })?;

    let session_id = crate::utils::generate_id("pf");
    let created_at = chrono::Utc::now();

    let session = PortForwardSession {
        id: session_id.clone(),
        context: context.clone(),
        pod: pod.clone(),
        namespace: namespace.clone(),
        local_port: config.local_port,
        remote_port: config.remote_port,
        auto_reconnect: config.auto_reconnect,
        created_at,
    };

    state
        .port_forward_sessions
        .insert(session_id.clone(), session.clone());

    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    state
        .port_forward_controls
        .insert(session_id.clone(), cancel_tx);

    let event_tx = state.event_tx.clone();
    let session_id_for_task = session_id.clone();
    let namespace_for_task = namespace.clone();
    let pod_for_task = pod.clone();
    let client_for_task = (*client).clone();
    let auto_reconnect = config.auto_reconnect;
    let remote_port = config.remote_port;
    let local_port = config.local_port;
    let sessions = state.port_forward_sessions.clone();
    let controls = state.port_forward_controls.clone();

    tokio::spawn(async move {
        // Drop guard ensures map entries are removed on every exit
        // path — including a panic in listener.accept() or anywhere
        // else inside the loop. The explicit removes that used to live
        // at the bottom of this task have moved into the guard.
        let _cleanup = PortForwardCleanup {
            sessions: sessions.clone(),
            controls: controls.clone(),
            key: session_id_for_task.clone(),
        };

        emit_port_forward_status(
            &event_tx,
            &session_id_for_task,
            &pod_for_task,
            &namespace_for_task,
            local_port,
            remote_port,
            "listening",
            Some(format!(
                "127.0.0.1:{local_port} -> {pod_for_task}:{remote_port}"
            )),
            None,
        );

        loop {
            tokio::select! {
                _ = &mut cancel_rx => {
                    break;
                }
                accept_result = listener.accept() => {
                    match accept_result {
                        Ok((stream, _)) => {
                            let event_tx = event_tx.clone();
                            let session_id = session_id_for_task.clone();
                            let pod = pod_for_task.clone();
                            let namespace = namespace_for_task.clone();
                            let client = client_for_task.clone();

                            tokio::spawn(async move {
                                forward_connection(
                                    pod,
                                    namespace,
                                    remote_port,
                                    local_port,
                                    auto_reconnect,
                                    client,
                                    stream,
                                    event_tx,
                                    session_id,
                                ).await;
                            });
                        }
                        Err(err) => {
                            emit_port_forward_status(
                                &event_tx, &session_id_for_task, &pod_for_task, &namespace_for_task,
                                local_port, remote_port, "error",
                                Some(format!("Listener error: {err}")), None,
                            );
                            break;
                        }
                    }
                }
            }
        }

        emit_port_forward_status(
            &event_tx,
            &session_id_for_task,
            &pod_for_task,
            &namespace_for_task,
            local_port,
            remote_port,
            "stopped",
            None,
            None,
        );
        // _cleanup drops here, removing both map entries.
    });

    Ok(PortForwardSessionInfo {
        id: session.id,
        context: session.context,
        pod: session.pod,
        namespace: session.namespace,
        local_port: session.local_port,
        remote_port: session.remote_port,
        auto_reconnect: session.auto_reconnect,
        created_at: session.created_at.to_rfc3339(),
    })
}

/// Stop a running port-forward session
#[tauri::command]
pub fn stop_port_forward(forward_id: String, state: State<'_, AppState>) -> Result<()> {
    // Remove from both maps atomically to avoid race conditions
    // The background task will also try to remove, but that's fine (no-op if already removed)
    state.port_forward_sessions.remove(&forward_id);
    if let Some((_, cancel_tx)) = state.port_forward_controls.remove(&forward_id) {
        let _ = cancel_tx.send(());
    }

    Ok(())
}

/// List active port-forward sessions
#[tauri::command]
pub fn list_port_forwards(state: State<'_, AppState>) -> Result<Vec<PortForwardSessionInfo>> {
    let sessions = state
        .port_forward_sessions
        .iter()
        .map(|entry| {
            let session = entry.value();
            PortForwardSessionInfo {
                id: session.id.clone(),
                context: session.context.clone(),
                pod: session.pod.clone(),
                namespace: session.namespace.clone(),
                local_port: session.local_port,
                remote_port: session.remote_port,
                auto_reconnect: session.auto_reconnect,
                created_at: session.created_at.to_rfc3339(),
            }
        })
        .collect();

    Ok(sessions)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_session(id: &str) -> PortForwardSession {
        PortForwardSession {
            id: id.to_string(),
            context: "ctx".to_string(),
            pod: "p".to_string(),
            namespace: "n".to_string(),
            local_port: 8080,
            remote_port: 80,
            auto_reconnect: false,
            created_at: chrono::Utc::now(),
        }
    }

    #[test]
    fn cleanup_guard_removes_from_both_maps_on_drop() {
        let sessions: Arc<DashMap<String, PortForwardSession>> = Arc::new(DashMap::new());
        let controls: Arc<DashMap<String, oneshot::Sender<()>>> = Arc::new(DashMap::new());

        sessions.insert("k".to_string(), make_test_session("k"));
        let (tx, _rx) = oneshot::channel::<()>();
        controls.insert("k".to_string(), tx);
        assert_eq!(sessions.len(), 1);
        assert_eq!(controls.len(), 1);

        {
            let _guard = PortForwardCleanup {
                sessions: sessions.clone(),
                controls: controls.clone(),
                key: "k".to_string(),
            };
        }

        assert_eq!(
            sessions.len(),
            0,
            "guard's Drop must remove the session entry — same path runs on panic-unwind"
        );
        assert_eq!(
            controls.len(),
            0,
            "guard's Drop must remove the control entry"
        );
    }

    #[test]
    fn cleanup_guard_drop_is_safe_when_entries_already_removed() {
        // Race: stop_port_forward removes both entries while the
        // listener task is still running. The guard's Drop must not
        // panic when the keys are no longer in either map.
        let sessions: Arc<DashMap<String, PortForwardSession>> = Arc::new(DashMap::new());
        let controls: Arc<DashMap<String, oneshot::Sender<()>>> = Arc::new(DashMap::new());

        let guard = PortForwardCleanup {
            sessions: sessions.clone(),
            controls: controls.clone(),
            key: "missing".to_string(),
        };
        drop(guard); // must not panic

        assert_eq!(sessions.len(), 0);
        assert_eq!(controls.len(), 0);
    }
}
