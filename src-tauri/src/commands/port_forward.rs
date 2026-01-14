//! Pod port-forward commands

use crate::commands::helpers::ResourceContext;
use crate::commands::settings::save_config;
use crate::config::{AppConfig, PortForwardConfig as StoredPortForwardConfig};
use crate::error::{Error, Result};
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
#[serde(rename_all = "camelCase")]
pub struct PortForwardRequest {
    pub local_port: u16,
    pub remote_port: u16,
    pub auto_reconnect: bool,
}

/// Active port-forward session info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

/// Saved port-forward config payload
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortForwardConfigPayload {
    pub context: String,
    pub name: String,
    pub pod: String,
    pub namespace: String,
    pub local_port: u16,
    pub remote_port: u16,
    pub auto_reconnect: bool,
    pub auto_start: bool,
}

/// Saved port-forward config info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortForwardConfigInfo {
    pub id: String,
    pub context: String,
    pub name: String,
    pub pod: String,
    pub namespace: String,
    pub local_port: u16,
    pub remote_port: u16,
    pub auto_reconnect: bool,
    pub auto_start: bool,
    pub created_at: String,
}

fn normalize_port_forward_config(
    payload: PortForwardConfigPayload,
    id: String,
    created_at: String,
) -> Result<StoredPortForwardConfig> {
    let context = payload.context.trim();
    if context.is_empty() {
        return Err(Error::InvalidInput("Context is required".to_string()));
    }
    let pod = payload.pod.trim();
    if pod.is_empty() {
        return Err(Error::InvalidInput("Pod name is required".to_string()));
    }
    let namespace = payload.namespace.trim();
    if namespace.is_empty() {
        return Err(Error::InvalidInput("Namespace is required".to_string()));
    }
    if payload.local_port == 0 || payload.remote_port == 0 {
        return Err(Error::InvalidInput(
            "Ports must be greater than 0".to_string(),
        ));
    }

    let name = payload.name.trim();
    let name = if name.is_empty() {
        format!("{pod}:{}", payload.remote_port)
    } else {
        name.to_string()
    };

    Ok(StoredPortForwardConfig {
        id,
        context: context.to_string(),
        name,
        pod: pod.to_string(),
        namespace: namespace.to_string(),
        local_port: payload.local_port,
        remote_port: payload.remote_port,
        auto_reconnect: payload.auto_reconnect,
        auto_start: payload.auto_start,
        created_at,
    })
}

fn map_config(config: &StoredPortForwardConfig) -> PortForwardConfigInfo {
    PortForwardConfigInfo {
        id: config.id.clone(),
        context: config.context.clone(),
        name: config.name.clone(),
        pod: config.pod.clone(),
        namespace: config.namespace.clone(),
        local_port: config.local_port,
        remote_port: config.remote_port,
        auto_reconnect: config.auto_reconnect,
        auto_start: config.auto_start,
        created_at: config.created_at.clone(),
    }
}

fn config_key(config: &StoredPortForwardConfig) -> String {
    format!(
        "{}:{}:{}:{}:{}",
        config.context,
        config.namespace,
        config.pod,
        config.local_port,
        config.remote_port
    )
}

/// Helper for emitting port-forward status events
fn emit_port_forward_status(
    event_tx: &tokio::sync::broadcast::Sender<AppEvent>,
    session_id: &str,
    pod: &str,
    namespace: &str,
    local_port: u16,
    remote_port: u16,
    status: &str,
    message: Option<String>,
    attempt: Option<u32>,
) {
    let _ = event_tx.send(AppEvent::PortForwardStatus {
        id: session_id.to_string(),
        pod: pod.to_string(),
        namespace: namespace.to_string(),
        local_port,
        remote_port,
        status: status.to_string(),
        message,
        attempt,
    });
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
    let ctx = ResourceContext::from_client(client, namespace.clone());
    let pod_api: Api<k8s_openapi::api::core::v1::Pod> = ctx.namespaced_api();
    let mut attempt: u32 = 0;

    loop {
        match pod_api.portforward(&pod, &[remote_port]).await {
            Ok(mut portforwarder) => {
                if attempt > 0 {
                    emit_port_forward_status(
                        &event_tx, &session_id, &pod, &namespace,
                        local_port, remote_port, "reconnected", None, Some(attempt),
                    );
                }

                if let Some(mut remote_stream) = portforwarder.take_stream(remote_port) {
                    let _ =
                        tokio::io::copy_bidirectional(&mut local_stream, &mut remote_stream).await;
                } else {
                    emit_port_forward_status(
                        &event_tx, &session_id, &pod, &namespace,
                        local_port, remote_port, "error",
                        Some("Failed to open port forward stream".to_string()), None,
                    );
                }

                break;
            }
            Err(err) => {
                if !auto_reconnect {
                    emit_port_forward_status(
                        &event_tx, &session_id, &pod, &namespace,
                        local_port, remote_port, "error",
                        Some(format!("Port-forward failed: {err}")), None,
                    );
                    break;
                }

                attempt += 1;
                let backoff = Duration::from_secs(u64::from(attempt).min(10));
                emit_port_forward_status(
                    &event_tx, &session_id, &pod, &namespace,
                    local_port, remote_port, "reconnecting",
                    Some(format!("Retry in {}s", backoff.as_secs())), Some(attempt),
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
    license: State<'_, crate::auth::license_client::LicenseClient>,
) -> Result<PortForwardSessionInfo> {
    license.require_premium_license().await?;
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
            Error::Connection(format!(
                "Failed to bind port {}: {e}",
                config.local_port
            ))
        })?;

    let session_id = crate::utils::generate_id("pf");
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
        emit_port_forward_status(
            &event_tx, &session_id_for_task, &pod_for_task, &namespace_for_task,
            local_port, remote_port, "listening",
            Some(format!("127.0.0.1:{local_port} -> {pod_for_task}:{remote_port}")), None,
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

        controls.remove(&session_id_for_task);
        sessions.remove(&session_id_for_task);

        emit_port_forward_status(
            &event_tx, &session_id_for_task, &pod_for_task, &namespace_for_task,
            local_port, remote_port, "stopped", None, None,
        );
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
pub fn stop_port_forward(
    forward_id: String,
    state: State<'_, AppState>,
) -> Result<()> {
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
pub fn list_port_forwards(
    state: State<'_, AppState>,
) -> Result<Vec<PortForwardSessionInfo>> {
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

/// List saved port-forward configs
#[tauri::command]
pub fn list_port_forward_configs() -> Result<Vec<PortForwardConfigInfo>> {
    let config = AppConfig::load()?;
    Ok(config
        .port_forward
        .configs
        .iter()
        .map(map_config)
        .collect())
}

/// Create a saved port-forward config
#[tauri::command]
pub fn create_port_forward_config(
    payload: PortForwardConfigPayload,
) -> Result<PortForwardConfigInfo> {
    let mut app_config = AppConfig::load()?;
    let created_at = chrono::Utc::now().to_rfc3339();
    let id = crate::utils::generate_id("pf-config");
    let config = normalize_port_forward_config(payload, id, created_at)?;

    let key = config_key(&config);
    if app_config
        .port_forward
        .configs
        .iter()
        .any(|existing| config_key(existing) == key)
    {
        return Err(Error::InvalidInput(
            "Port-forward config already exists".to_string(),
        ));
    }

    app_config.port_forward.configs.push(config.clone());
    save_config(&app_config)?;
    Ok(map_config(&config))
}

/// Update an existing port-forward config
#[tauri::command]
pub fn update_port_forward_config(
    id: String,
    payload: PortForwardConfigPayload,
) -> Result<PortForwardConfigInfo> {
    let mut app_config = AppConfig::load()?;
    let index = app_config
        .port_forward
        .configs
        .iter()
        .position(|item| item.id == id)
        .ok_or_else(|| Error::InvalidInput("Port-forward config not found".to_string()))?;

    let created_at = app_config.port_forward.configs[index].created_at.clone();
    let updated = normalize_port_forward_config(payload, id.clone(), created_at)?;
    let key = config_key(&updated);
    if app_config
        .port_forward
        .configs
        .iter()
        .any(|existing| existing.id != id && config_key(existing) == key)
    {
        return Err(Error::InvalidInput(
            "Port-forward config already exists".to_string(),
        ));
    }

    app_config.port_forward.configs[index] = updated.clone();
    save_config(&app_config)?;
    Ok(map_config(&updated))
}

/// Delete a saved port-forward config
#[tauri::command]
pub fn delete_port_forward_config(id: String) -> Result<()> {
    let mut app_config = AppConfig::load()?;
    let before = app_config.port_forward.configs.len();
    app_config.port_forward.configs.retain(|item| item.id != id);
    if before == app_config.port_forward.configs.len() {
        return Err(Error::InvalidInput("Port-forward config not found".to_string()));
    }
    save_config(&app_config)?;
    Ok(())
}
