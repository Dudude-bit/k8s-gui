//! Log streaming commands

use crate::error::{Error, Result};
use crate::logs::{LogConfig, LogLine, LogStreamer};
use crate::state::{AppState, LogStream};
use crate::utils::normalize_optional_namespace;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::oneshot;

/// Log stream configuration from frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamLogConfig {
    pub pod_name: String,
    pub namespace: Option<String>,
    pub container: Option<String>,
    pub follow: bool,
    pub tail_lines: Option<i64>,
    pub since_seconds: Option<i64>,
    pub timestamps: bool,
    pub previous: bool,
}

/// Start streaming logs from a pod
#[tauri::command]
pub async fn stream_pod_logs(
    config: StreamLogConfig,
    state: State<'_, AppState>,
) -> Result<String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| Error::Internal(crate::error::messages::NO_CLUSTER.to_string()))?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| Error::Internal(crate::error::messages::NO_CLIENT.to_string()))?;

    let namespace = normalize_optional_namespace(config.namespace.clone())
        .unwrap_or_else(|| "default".to_string());

    let mut log_config = LogConfig::new(&config.pod_name, &namespace)
        .with_follow(config.follow)
        .with_tail(config.tail_lines.unwrap_or(100))
        .with_timestamps(config.timestamps)
        .with_previous(config.previous);

    if let Some(since_seconds) = config.since_seconds {
        log_config = log_config.with_since_seconds(since_seconds);
    }

    if let Some(ref container) = config.container {
        log_config = log_config.with_container(container);
    }

    let stream_id = crate::utils::generate_id("log");
    let event_tx = state.event_tx.clone();

    let streamer = LogStreamer::new(Arc::new((*client).clone()), event_tx);

    let (cancel_tx, cancel_rx) = oneshot::channel();
    let stream_id_clone = stream_id.clone();

    // Store the log stream info
    let log_stream = LogStream {
        id: stream_id.clone(),
        pod: config.pod_name.clone(),
        container: config.container.unwrap_or_default(),
        namespace: namespace.clone(),
        cancel_tx,
    };
    state.log_streams.insert(stream_id.clone(), log_stream);

    // Spawn background task to stream logs
    tokio::spawn(async move {
        if let Err(e) = streamer
            .stream_logs(stream_id_clone.clone(), log_config, cancel_rx)
            .await
        {
            tracing::error!("Log stream {} error: {}", stream_id_clone, e);
        }
    });

    Ok(stream_id)
}

/// Get pod logs (non-streaming, returns all at once)
#[tauri::command]
pub async fn get_pod_logs(
    pod_name: String,
    namespace: Option<String>,
    container: Option<String>,
    tail_lines: Option<i64>,
    since_seconds: Option<i64>,
    previous: bool,
    state: State<'_, AppState>,
) -> Result<Vec<LogLine>> {
    let context = state
        .get_current_context()
        .ok_or_else(|| Error::Internal(crate::error::messages::NO_CLUSTER.to_string()))?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| Error::Internal(crate::error::messages::NO_CLIENT.to_string()))?;

    let namespace =
        normalize_optional_namespace(namespace).unwrap_or_else(|| "default".to_string());

    let mut log_config = LogConfig::new(&pod_name, &namespace)
        .with_follow(false)
        .with_tail(tail_lines.unwrap_or(1000))
        .with_previous(previous);

    if let Some(since_seconds) = since_seconds {
        log_config = log_config.with_since_seconds(since_seconds);
    }

    if let Some(container) = container {
        log_config = log_config.with_container(&container);
    }

    let event_tx = state.event_tx.clone();
    let streamer = LogStreamer::new(Arc::new((*client).clone()), event_tx);
    let logs = streamer.get_logs(&log_config).await?;

    Ok(logs)
}

/// Stop log streaming
#[tauri::command]
pub fn stop_log_stream(stream_id: String, state: State<'_, AppState>) -> Result<()> {
    if let Some((_, log_stream)) = state.log_streams.remove(&stream_id) {
        let _ = log_stream.cancel_tx.send(());
        tracing::info!("Log stream {} stopped", stream_id);
    }
    Ok(())
}
