//! Log streaming module
//! 
//! Provides real-time log streaming from Kubernetes pods with filtering and search.

use crate::error::{Error, Result};
use crate::state::AppEvent;
use chrono::{DateTime, Utc};
use futures::StreamExt;
use k8s_openapi::api::core::v1::Pod;
use kube::{
    api::{Api, LogParams},
    Client,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{broadcast, oneshot};
use tokio::io::{AsyncBufReadExt, BufReader};

/// Log streaming configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogConfig {
    /// Pod name
    pub pod: String,
    /// Container name (optional, defaults to first container)
    pub container: Option<String>,
    /// Namespace
    pub namespace: String,
    /// Follow logs (stream)
    #[serde(default = "default_follow")]
    pub follow: bool,
    /// Number of lines to tail
    pub tail_lines: Option<i64>,
    /// Include timestamps
    #[serde(default)]
    pub timestamps: bool,
    /// Since seconds
    pub since_seconds: Option<i64>,
    /// Since time
    pub since_time: Option<DateTime<Utc>>,
    /// Previous container logs
    #[serde(default)]
    pub previous: bool,
}

fn default_follow() -> bool {
    true
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            pod: String::new(),
            container: None,
            namespace: "default".to_string(),
            follow: true,
            tail_lines: Some(100),
            timestamps: true,
            since_seconds: None,
            since_time: None,
            previous: false,
        }
    }
}

impl LogConfig {
    /// Create a new log config
    pub fn new(pod: &str, namespace: &str) -> Self {
        Self {
            pod: pod.to_string(),
            namespace: namespace.to_string(),
            ..Default::default()
        }
    }

    /// Set container
    pub fn with_container(mut self, container: &str) -> Self {
        self.container = Some(container.to_string());
        self
    }

    /// Set tail lines
    pub fn with_tail(mut self, lines: i64) -> Self {
        self.tail_lines = Some(lines);
        self
    }

    /// Set follow
    pub fn with_follow(mut self, follow: bool) -> Self {
        self.follow = follow;
        self
    }

    /// Convert to kube LogParams
    pub fn to_log_params(&self) -> LogParams {
        let mut params = LogParams {
            follow: self.follow,
            timestamps: self.timestamps,
            previous: self.previous,
            ..Default::default()
        };

        if let Some(container) = &self.container {
            params.container = Some(container.clone());
        }

        if let Some(tail) = self.tail_lines {
            params.tail_lines = Some(tail);
        }

        if let Some(since) = self.since_seconds {
            params.since_seconds = Some(since);
        }

        params
    }
}

/// Log line with parsed metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogLine {
    /// Timestamp (if available)
    pub timestamp: Option<DateTime<Utc>>,
    /// Log message
    pub message: String,
    /// Log level (if parseable)
    pub level: Option<LogLevel>,
    /// Source pod
    pub pod: String,
    /// Source container
    pub container: String,
    /// Namespace
    pub namespace: String,
}

/// Log level
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
    Fatal,
    Unknown,
}

impl LogLevel {
    /// Parse log level from message
    pub fn parse(message: &str) -> Self {
        let lower = message.to_lowercase();
        if lower.contains("error") || lower.contains(" err ") {
            LogLevel::Error
        } else if lower.contains("warn") {
            LogLevel::Warn
        } else if lower.contains("info") {
            LogLevel::Info
        } else if lower.contains("debug") {
            LogLevel::Debug
        } else if lower.contains("fatal") {
            LogLevel::Fatal
        } else {
            LogLevel::Unknown
        }
    }
}

/// Log streamer for real-time log streaming
pub struct LogStreamer {
    client: Arc<Client>,
    event_tx: broadcast::Sender<AppEvent>,
}

impl LogStreamer {
    /// Create a new log streamer
    pub fn new(client: Arc<Client>, event_tx: broadcast::Sender<AppEvent>) -> Self {
        Self { client, event_tx }
    }

    /// Get logs (non-streaming)
    pub async fn get_logs(&self, config: &LogConfig) -> Result<Vec<LogLine>> {
        let api: Api<Pod> = Api::namespaced((*self.client).clone(), &config.namespace);
        
        let mut params = config.to_log_params();
        params.follow = false;

        let logs = api
            .logs(&config.pod, &params)
            .await
            .map_err(|e| Error::LogStream(format!("Failed to get logs: {}", e)))?;

        let container = config.container.clone().unwrap_or_else(|| "main".to_string());
        
        Ok(self.parse_logs(&logs, &config.pod, &container, &config.namespace))
    }

    /// Stream logs
    pub async fn stream_logs(
        &self,
        stream_id: String,
        config: LogConfig,
        mut cancel_rx: oneshot::Receiver<()>,
    ) -> Result<()> {
        let api: Api<Pod> = Api::namespaced((*self.client).clone(), &config.namespace);
        let params = config.to_log_params();

        let container = config.container.clone().unwrap_or_else(|| "main".to_string());
        let pod = config.pod.clone();
        let namespace = config.namespace.clone();

        let stream = api
            .log_stream(&config.pod, &params)
            .await
            .map_err(|e| Error::LogStream(format!("Failed to start log stream: {}", e)))?;

        // Convert to tokio's AsyncBufRead using compat layer
        use tokio_util::compat::FuturesAsyncReadCompatExt;
        let reader = BufReader::new(stream.compat());
        let mut lines = reader.lines();

        loop {
            tokio::select! {
                _ = &mut cancel_rx => {
                    tracing::debug!("Log stream {} cancelled", stream_id);
                    break;
                }
                result = lines.next_line() => {
                    match result {
                        Ok(Some(line)) => {
                            let log_line = self.parse_log_line(
                                &line,
                                &pod,
                                &container,
                                &namespace,
                            );
                            
                            let _ = self.event_tx.send(AppEvent::LogMessage {
                                pod: pod.clone(),
                                container: container.clone(),
                                message: log_line.message.clone(),
                                timestamp: log_line.timestamp.map(|t| t.to_rfc3339()),
                            });
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

        Ok(())
    }

    /// Parse log output into log lines
    fn parse_logs(
        &self,
        logs: &str,
        pod: &str,
        container: &str,
        namespace: &str,
    ) -> Vec<LogLine> {
        logs.lines()
            .map(|line| self.parse_log_line(line, pod, container, namespace))
            .collect()
    }

    /// Parse a single log line
    fn parse_log_line(
        &self,
        line: &str,
        pod: &str,
        container: &str,
        namespace: &str,
    ) -> LogLine {
        // Try to parse timestamp from the beginning of the line
        // Kubernetes log timestamps are in RFC3339 format
        let (timestamp, message) = if line.len() > 30 {
            if let Some(space_idx) = line.find(' ') {
                let potential_ts = &line[..space_idx];
                if let Ok(ts) = DateTime::parse_from_rfc3339(potential_ts) {
                    (Some(ts.with_timezone(&Utc)), line[space_idx + 1..].to_string())
                } else {
                    (None, line.to_string())
                }
            } else {
                (None, line.to_string())
            }
        } else {
            (None, line.to_string())
        };

        let level = LogLevel::parse(&message);

        LogLine {
            timestamp,
            message,
            level: Some(level),
            pod: pod.to_string(),
            container: container.to_string(),
            namespace: namespace.to_string(),
        }
    }
}

/// Log filter for searching and filtering logs
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LogFilter {
    /// Search query
    pub query: Option<String>,
    /// Filter by log level
    pub levels: Vec<LogLevel>,
    /// Since timestamp
    pub since: Option<DateTime<Utc>>,
    /// Until timestamp
    pub until: Option<DateTime<Utc>>,
    /// Include containers
    pub containers: Vec<String>,
    /// Regex search
    #[serde(default)]
    pub regex: bool,
    /// Case sensitive
    #[serde(default)]
    pub case_sensitive: bool,
}

impl LogFilter {
    /// Apply filter to log lines
    pub fn apply(&self, logs: &[LogLine]) -> Vec<LogLine> {
        logs.iter()
            .filter(|log| self.matches(log))
            .cloned()
            .collect()
    }

    /// Check if a log line matches the filter
    pub fn matches(&self, log: &LogLine) -> bool {
        // Filter by container
        if !self.containers.is_empty() && !self.containers.contains(&log.container) {
            return false;
        }

        // Filter by level
        if !self.levels.is_empty() {
            if let Some(level) = &log.level {
                if !self.levels.contains(level) {
                    return false;
                }
            }
        }

        // Filter by time range
        if let Some(since) = self.since {
            if let Some(ts) = log.timestamp {
                if ts < since {
                    return false;
                }
            }
        }

        if let Some(until) = self.until {
            if let Some(ts) = log.timestamp {
                if ts > until {
                    return false;
                }
            }
        }

        // Filter by query
        if let Some(query) = &self.query {
            let message = if self.case_sensitive {
                log.message.clone()
            } else {
                log.message.to_lowercase()
            };

            let search = if self.case_sensitive {
                query.clone()
            } else {
                query.to_lowercase()
            };

            if self.regex {
                if let Ok(re) = regex::Regex::new(&search) {
                    if !re.is_match(&message) {
                        return false;
                    }
                } else {
                    return false;
                }
            } else if !message.contains(&search) {
                return false;
            }
        }

        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_config_default() {
        let config = LogConfig::default();
        assert!(config.follow);
        assert_eq!(config.tail_lines, Some(100));
    }

    #[test]
    fn test_log_level_parse() {
        assert_eq!(LogLevel::parse("ERROR: something failed"), LogLevel::Error);
        assert_eq!(LogLevel::parse("INFO: started"), LogLevel::Info);
        assert_eq!(LogLevel::parse("random message"), LogLevel::Unknown);
    }

    #[test]
    fn test_log_filter() {
        let logs = vec![
            LogLine {
                timestamp: None,
                message: "ERROR: failed".to_string(),
                level: Some(LogLevel::Error),
                pod: "test".to_string(),
                container: "main".to_string(),
                namespace: "default".to_string(),
            },
            LogLine {
                timestamp: None,
                message: "INFO: success".to_string(),
                level: Some(LogLevel::Info),
                pod: "test".to_string(),
                container: "main".to_string(),
                namespace: "default".to_string(),
            },
        ];

        let filter = LogFilter {
            levels: vec![LogLevel::Error],
            ..Default::default()
        };

        let filtered = filter.apply(&logs);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].message, "ERROR: failed");
    }
}
