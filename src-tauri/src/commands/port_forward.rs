//! Pod port-forward commands

use crate::state::{AppEvent, AppState};
use crate::utils::require_namespace;
use kube::Api;
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::time::{sleep, Duration};

/// Port-forward request payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortForwardRequest {
    pub local_port: u16,
    pub remote_port: u16,
    pub auto_reconnect: bool,
}

/// Active port-forward session info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortForwardSessionInfo {
    pub id: String,
    pub context: String,
    pub pod: String,
    pub namespace: String,
    pub local_port: u16,
    pub remote_port: u16,
    pub auto_reconnect: bool,
    pub created_at: String,
}

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
    let pod_api: Api<k8s_openapi::api::core::v1::Pod> = Api::namespaced(client, &namespace);
    let mut attempt: u32 = 0;

    loop {
        match pod_api.portforward(&pod, &[remote_port]).await {
            Ok(mut portforwarder) => {
                if attempt > 0 {
                    let _ = event_tx.send(AppEvent::PortForwardStatus {
                        id: session_id.clone(),
                        pod: pod.clone(),
                        namespace: namespace.clone(),
                        local_port,
                        remote_port,
                        status: "reconnected".to_string(),
                        message: None,
                        attempt: Some(attempt),
                    });
                }

                if let Some(mut remote_stream) = portforwarder.take_stream(remote_port) {
                    let _ =
                        tokio::io::copy_bidirectional(&mut local_stream, &mut remote_stream).await;
                } else {
                    let _ = event_tx.send(AppEvent::PortForwardStatus {
                        id: session_id.clone(),
                        pod: pod.clone(),
                        namespace: namespace.clone(),
                        local_port,
                        remote_port,
                        status: "error".to_string(),
                        message: Some("Failed to open port forward stream".to_string()),
                        attempt: None,
                    });
                }

                break;
            }
            Err(err) => {
                if !auto_reconnect {
                    let _ = event_tx.send(AppEvent::PortForwardStatus {
                        id: session_id.clone(),
                        pod: pod.clone(),
                        namespace: namespace.clone(),
                        local_port,
                        remote_port,
                        status: "error".to_string(),
                        message: Some(format!("Port-forward failed: {err}")),
                        attempt: None,
                    });
                    break;
                }

                attempt += 1;
                let backoff = Duration::from_secs(u64::from(attempt).min(10));
                let _ = event_tx.send(AppEvent::PortForwardStatus {
                    id: session_id.clone(),
                    pod: pod.clone(),
                    namespace: namespace.clone(),
                    local_port,
                    remote_port,
                    status: "reconnecting".to_string(),
                    message: Some(format!("Retry in {}s", backoff.as_secs())),
                    attempt: Some(attempt),
                });
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
    license: State<'_, crate::auth::license_client::LicenseClient>,
) -> Result<PortForwardSessionInfo, String> {
    license
        .require_premium_license()
        .await
        .map_err(|e| e.to_string())?;
    if config.local_port == 0 || config.remote_port == 0 {
        return Err("Ports must be greater than 0".to_string());
    }

    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let namespace =
        require_namespace(namespace, state.get_namespace(&context)).map_err(|e| e.to_string())?;

    let listener = TcpListener::bind(("127.0.0.1", config.local_port))
        .await
        .map_err(|e| format!("Failed to bind port {}: {}", config.local_port, e))?;

    let session_id = format!("pf-{}", uuid::Uuid::new_v4());
    let created_at = chrono::Utc::now();

    let session = crate::state::PortForwardSession {
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
        let _ = event_tx.send(AppEvent::PortForwardStatus {
            id: session_id_for_task.clone(),
            pod: pod_for_task.clone(),
            namespace: namespace_for_task.clone(),
            local_port,
            remote_port,
            status: "listening".to_string(),
            message: Some(format!(
                "127.0.0.1:{local_port} -> {pod_for_task}:{remote_port}"
            )),
            attempt: None,
        });

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
                            let _ = event_tx.send(AppEvent::PortForwardStatus {
                                id: session_id_for_task.clone(),
                                pod: pod_for_task.clone(),
                                namespace: namespace_for_task.clone(),
                                local_port,
                                remote_port,
                                status: "error".to_string(),
                                message: Some(format!("Listener error: {err}")),
                                attempt: None,
                            });
                            break;
                        }
                    }
                }
            }
        }

        controls.remove(&session_id_for_task);
        sessions.remove(&session_id_for_task);

        let _ = event_tx.send(AppEvent::PortForwardStatus {
            id: session_id_for_task,
            pod: pod_for_task,
            namespace: namespace_for_task,
            local_port,
            remote_port,
            status: "stopped".to_string(),
            message: None,
            attempt: None,
        });
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
pub async fn stop_port_forward(
    forward_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if let Some((_, cancel_tx)) = state.port_forward_controls.remove(&forward_id) {
        let _ = cancel_tx.send(());
    }

    Ok(())
}

/// List active port-forward sessions
#[tauri::command]
pub async fn list_port_forwards(
    state: State<'_, AppState>,
) -> Result<Vec<PortForwardSessionInfo>, String> {
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
