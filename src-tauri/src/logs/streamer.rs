//! `LogStreamer` — owns a kube `Client` and an event broadcaster,
//! exposes `get_logs` (one-shot) and `stream_logs` (with batching
//! + periodic flush so verbose pods don't generate one Tauri
//! round-trip per line).

use crate::commands::helpers::ResourceContext;
use crate::error::{Error, Result};
use crate::state::{AppEvent, LogLineEvent};
use k8s_openapi::api::core::v1::Pod;
use kube::{api::Api, Client};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{broadcast, oneshot};
use tokio::time::{interval, MissedTickBehavior};

use super::config::LogConfig;
use super::parser;
use super::types::LogLine;

/// Maximum log lines buffered before forcing a flush, regardless of
/// the timer. Prevents a burst of fast-emitting log output from
/// growing the buffer unbounded between ticks.
const MAX_BATCH_SIZE: usize = 100;

/// Flush interval. 50ms keeps perceived latency low (~one frame at
/// 20fps) while collapsing 100+ events/sec verbose-pod streams into
/// ~20 events/sec of Tauri round-trips.
const FLUSH_INTERVAL: Duration = Duration::from_millis(50);

/// Streams logs from a pod, batches lines, emits `AppEvent::LogBatch`.
pub struct LogStreamer {
    client: Arc<Client>,
    event_tx: broadcast::Sender<AppEvent>,
}

impl LogStreamer {
    #[must_use]
    pub fn new(client: Arc<Client>, event_tx: broadcast::Sender<AppEvent>) -> Self {
        Self { client, event_tx }
    }

    /// One-shot: fetch logs and return them parsed. Forces
    /// `follow = false` regardless of `config.follow`.
    pub async fn get_logs(&self, config: &LogConfig) -> Result<Vec<LogLine>> {
        let ctx = ResourceContext::from_client((*self.client).clone(), config.namespace.clone());
        let api: Api<Pod> = ctx.namespaced_api();

        let mut params = config.to_log_params();
        params.follow = false;

        let logs = api
            .logs(&config.pod, &params)
            .await
            .map_err(|e| Error::LogStream(format!("Failed to get logs: {e}")))?;

        let container = config
            .container
            .clone()
            .unwrap_or_else(|| "main".to_string());

        Ok(parser::parse_logs(
            &logs,
            &config.pod,
            &container,
            &config.namespace,
        ))
    }

    /// Streaming follow loop. Buffers lines and flushes every
    /// `FLUSH_INTERVAL` (or sooner if the buffer fills) so verbose
    /// pods don't generate one Tauri round-trip per line.
    pub async fn stream_logs(
        &self,
        stream_id: String,
        config: LogConfig,
        mut cancel_rx: oneshot::Receiver<()>,
    ) -> Result<()> {
        let ctx = ResourceContext::from_client((*self.client).clone(), config.namespace.clone());
        let api: Api<Pod> = ctx.namespaced_api();
        let params = config.to_log_params();

        let container = config
            .container
            .clone()
            .unwrap_or_else(|| "main".to_string());
        let pod = config.pod.clone();
        let namespace = config.namespace.clone();

        let stream = api
            .log_stream(&config.pod, &params)
            .await
            .map_err(|e| Error::LogStream(format!("Failed to start log stream: {e}")))?;

        use tokio_util::compat::FuturesAsyncReadCompatExt;
        let reader = BufReader::new(stream.compat());
        let mut lines = reader.lines();

        // Buffer + periodic flush. Triggers: timer tick, buffer hits
        // MAX_BATCH_SIZE, cancel, or EOF.
        let mut buffer: Vec<LogLineEvent> = Vec::with_capacity(MAX_BATCH_SIZE);
        let mut flush_timer = interval(FLUSH_INTERVAL);
        // First tick fires immediately; skip it so an empty buffer
        // doesn't emit an empty batch right after subscribe.
        flush_timer.set_missed_tick_behavior(MissedTickBehavior::Skip);
        flush_timer.tick().await;

        loop {
            tokio::select! {
                biased;
                _ = &mut cancel_rx => {
                    tracing::debug!("Log stream {} cancelled", stream_id);
                    break;
                }
                _ = flush_timer.tick() => {
                    if !buffer.is_empty() {
                        flush_batch(&self.event_tx, &stream_id, &mut buffer);
                    }
                }
                result = lines.next_line() => {
                    match result {
                        Ok(Some(line)) => {
                            let log_line = parser::parse_log_line(
                                &line,
                                &pod,
                                &container,
                                &namespace,
                            );

                            buffer.push(LogLineEvent {
                                message: log_line.message,
                                timestamp: log_line.timestamp.map(|t| t.to_rfc3339()),
                                level: log_line.level,
                                format: log_line.format,
                                fields: log_line.fields,
                                raw: log_line.raw,
                            });

                            if buffer.len() >= MAX_BATCH_SIZE {
                                flush_batch(&self.event_tx, &stream_id, &mut buffer);
                            }
                        }
                        Ok(None) => {
                            tracing::debug!("Log stream ended");
                            break;
                        }
                        Err(e) => {
                            tracing::error!("Log stream error: {}", e);
                            let _ = self.event_tx.send(AppEvent::Error {
                                code: "LOG_STREAM_ERROR".to_string(),
                                message: e.to_string(),
                            });
                            break;
                        }
                    }
                }
            }
        }

        // Final flush on exit so trailing lines don't get dropped.
        if !buffer.is_empty() {
            flush_batch(&self.event_tx, &stream_id, &mut buffer);
        }

        Ok(())
    }
}

/// Drain the per-stream buffer into a single `AppEvent::LogBatch`.
/// Caller guarantees the buffer is non-empty.
fn flush_batch(
    event_tx: &broadcast::Sender<AppEvent>,
    stream_id: &str,
    buffer: &mut Vec<LogLineEvent>,
) {
    let lines = std::mem::take(buffer);
    let _ = event_tx.send(AppEvent::LogBatch {
        stream_id: stream_id.to_string(),
        lines,
    });
}
