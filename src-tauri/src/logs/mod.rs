//! Log streaming module
//!
//! Provides real-time log streaming from Kubernetes pods with filtering and search.

use crate::error::{Error, Result};
use crate::state::AppEvent;
use crate::commands::helpers::ResourceContext;
use chrono::{DateTime, Utc};
use k8s_openapi::api::core::v1::Pod;
use kube::{
    api::{Api, LogParams},
    Client,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{broadcast, oneshot};

/// Log streaming configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    #[must_use]
    pub fn new(pod: &str, namespace: &str) -> Self {
        Self {
            pod: pod.to_string(),
            namespace: namespace.to_string(),
            ..Default::default()
        }
    }

    /// Set container
    #[must_use]
    pub fn with_container(mut self, container: &str) -> Self {
        self.container = Some(container.to_string());
        self
    }

    /// Set tail lines
    #[must_use]
    pub fn with_tail(mut self, lines: i64) -> Self {
        self.tail_lines = Some(lines);
        self
    }

    /// Set follow
    #[must_use]
    pub fn with_follow(mut self, follow: bool) -> Self {
        self.follow = follow;
        self
    }

    /// Set timestamps
    #[must_use]
    pub fn with_timestamps(mut self, timestamps: bool) -> Self {
        self.timestamps = timestamps;
        self
    }

    /// Set previous
    #[must_use]
    pub fn with_previous(mut self, previous: bool) -> Self {
        self.previous = previous;
        self
    }

    /// Set since seconds
    #[must_use]
    pub fn with_since_seconds(mut self, since_seconds: i64) -> Self {
        self.since_seconds = Some(since_seconds);
        self
    }

    /// Convert to kube `LogParams`
    #[must_use]
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
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    /// Timestamp (if available)
    pub timestamp: Option<DateTime<Utc>>,
    /// Log message
    pub message: String,
    /// Log level (if parseable)
    pub level: Option<LogLevel>,
    /// Log format (json/logfmt/plain)
    pub format: LogFormat,
    /// Parsed fields for structured formats
    pub fields: Option<BTreeMap<String, String>>,
    /// Raw log line (before parsing)
    pub raw: String,
    /// Source pod
    pub pod: String,
    /// Source container
    pub container: String,
    /// Namespace
    pub namespace: String,
}

/// Log format
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogFormat {
    Plain,
    Json,
    Logfmt,
    Klog,
    Logback,
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
    #[must_use]
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

    /// Parse log level from a structured field value
    #[must_use]
    pub fn parse_value(value: &str) -> Option<Self> {
        let lower = value.trim().to_lowercase();
        if lower.is_empty() {
            return None;
        }
        let level = if lower.starts_with("fatal") || lower.starts_with("critical") {
            LogLevel::Fatal
        } else if lower.starts_with("error") || lower == "err" {
            LogLevel::Error
        } else if lower.starts_with("warn") || lower.starts_with("warning") {
            LogLevel::Warn
        } else if lower.starts_with("info") {
            LogLevel::Info
        } else if lower.starts_with("debug") || lower.starts_with("trace") {
            LogLevel::Debug
        } else {
            LogLevel::Unknown
        };
        Some(level)
    }
}

/// Log streamer for real-time log streaming
pub struct LogStreamer {
    client: Arc<Client>,
    event_tx: broadcast::Sender<AppEvent>,
}

impl LogStreamer {
    /// Create a new log streamer
    #[must_use]
    pub fn new(client: Arc<Client>, event_tx: broadcast::Sender<AppEvent>) -> Self {
        Self { client, event_tx }
    }

    /// Get logs (non-streaming)
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

        Ok(Self::parse_logs(
            &logs,
            &config.pod,
            &container,
            &config.namespace,
        ))
    }

    /// Stream logs
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
                            let log_line = Self::parse_log_line(
                                &line,
                                &pod,
                                &container,
                                &namespace,
                            );

                            let _ = self.event_tx.send(AppEvent::LogMessage {
                                stream_id: stream_id.clone(),
                                pod: pod.clone(),
                                container: container.clone(),
                                message: log_line.message.clone(),
                                timestamp: log_line.timestamp.map(|t| t.to_rfc3339()),
                                level: log_line.level,
                                format: log_line.format,
                                fields: log_line.fields.clone(),
                                raw: log_line.raw.clone(),
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
    fn parse_logs(logs: &str, pod: &str, container: &str, namespace: &str) -> Vec<LogLine> {
        logs.lines()
            .map(|line| Self::parse_log_line(line, pod, container, namespace))
            .collect()
    }

    /// Parse a single log line
    fn parse_log_line(line: &str, pod: &str, container: &str, namespace: &str) -> LogLine {
        let raw = line.to_string();
        // Try to parse timestamp from the beginning of the line
        // Kubernetes log timestamps are in RFC3339 format
        let (timestamp, message) = if line.len() > 30 {
            if let Some(space_idx) = line.find(' ') {
                let potential_ts = &line[..space_idx];
                if let Ok(ts) = DateTime::parse_from_rfc3339(potential_ts) {
                    (
                        Some(ts.with_timezone(&Utc)),
                        line[space_idx + 1..].to_string(),
                    )
                } else {
                    (None, line.to_string())
                }
            } else {
                (None, line.to_string())
            }
        } else {
            (None, line.to_string())
        };

        let (format, fields, message, level_override) = Self::parse_structured_message(&message);
        let level = level_override.unwrap_or_else(|| LogLevel::parse(&message));

        LogLine {
            timestamp,
            message,
            level: Some(level),
            format,
            fields,
            raw,
            pod: pod.to_string(),
            container: container.to_string(),
            namespace: namespace.to_string(),
        }
    }

    fn parse_structured_message(
        message: &str,
    ) -> (
        LogFormat,
        Option<BTreeMap<String, String>>,
        String,
        Option<LogLevel>,
    ) {
        if let Some((fields, level, msg)) = Self::parse_json_message(message) {
            return (
                LogFormat::Json,
                Some(fields),
                msg.unwrap_or_else(|| message.to_string()),
                level,
            );
        }

        if let Some((fields, level, msg)) = Self::parse_logfmt_message(message) {
            return (
                LogFormat::Logfmt,
                Some(fields),
                msg.unwrap_or_else(|| message.to_string()),
                level,
            );
        }

        if let Some((msg, level)) = Self::parse_klog_message(message) {
            return (
                LogFormat::Klog,
                None,
                msg.unwrap_or_else(|| message.to_string()),
                Some(level),
            );
        }

        if let Some((msg, level)) = Self::parse_logback_message(message) {
            return (
                LogFormat::Logback,
                None,
                msg.unwrap_or_else(|| message.to_string()),
                Some(level),
            );
        }

        (LogFormat::Plain, None, message.to_string(), None)
    }

    fn parse_json_message(
        message: &str,
    ) -> Option<(BTreeMap<String, String>, Option<LogLevel>, Option<String>)> {
        let trimmed = message.trim_start();
        if !trimmed.starts_with('{') {
            return None;
        }

        let value: Value = serde_json::from_str(trimmed).ok()?;
        let object = value.as_object()?;

        // Require at least one common log field to consider this structured JSON
        let has_log_fields = object.contains_key("msg")
            || object.contains_key("message")
            || object.contains_key("level")
            || object.contains_key("lvl")
            || object.contains_key("severity")
            || object.contains_key("time")
            || object.contains_key("ts")
            || object.contains_key("timestamp")
            || object.contains_key("@timestamp")
            || object.contains_key("log");

        if !has_log_fields {
            return None;
        }

        let mut fields = BTreeMap::new();
        for (key, value) in object {
            let entry = match value {
                Value::String(inner) => inner.clone(),
                _ => value.to_string(),
            };
            fields.insert(key.clone(), entry);
        }

        let level_value = Self::extract_json_value(
            object,
            &["level", "lvl", "severity", "log.level"],
        );
        let message_value = Self::extract_json_value(
            object,
            &["msg", "message", "log", "event", "error"],
        );

        let level = level_value.as_deref().and_then(LogLevel::parse_value);

        Some((fields, level, message_value))
    }

    fn extract_json_value(
        object: &serde_json::Map<String, Value>,
        keys: &[&str],
    ) -> Option<String> {
        for key in keys {
            if let Some(value) = object.get(*key) {
                return Some(match value {
                    Value::String(inner) => inner.clone(),
                    _ => value.to_string(),
                });
            }
        }
        None
    }

    fn parse_logfmt_message(
        message: &str,
    ) -> Option<(BTreeMap<String, String>, Option<LogLevel>, Option<String>)> {
        let fields = Self::parse_logfmt_fields(message)?;
        let level_value = Self::extract_logfmt_value(&fields, &["level", "lvl", "severity"]);
        let message_value =
            Self::extract_logfmt_value(&fields, &["msg", "message", "log", "event", "error"]);
        let level = level_value.as_deref().and_then(LogLevel::parse_value);
        Some((fields, level, message_value))
    }

    fn parse_klog_message(message: &str) -> Option<(Option<String>, LogLevel)> {
        let mut chars = message.chars();
        let level_char = chars.next()?;
        let level = match level_char {
            'I' => LogLevel::Info,
            'W' => LogLevel::Warn,
            'E' => LogLevel::Error,
            'F' => LogLevel::Fatal,
            _ => return None,
        };

        let rest = chars.as_str();
        let bytes = rest.as_bytes();
        if bytes.len() < 8 {
            return None;
        }
        if !bytes[0..4].iter().all(|b| b.is_ascii_digit()) {
            return None;
        }
        if !bytes[4].is_ascii_whitespace() {
            return None;
        }
        if !bytes[5..].iter().any(|b| *b == b':') {
            return None;
        }

        let msg = if let Some(idx) = rest.find("] ") {
            Some(rest[idx + 2..].to_string())
        } else {
            None
        };

        Some((msg, level))
    }

    fn parse_logback_message(message: &str) -> Option<(Option<String>, LogLevel)> {
        let mut parts = message.split_whitespace();
        let date_token = parts.next()?;
        let time_token = parts.next()?;
        let level_token = parts.next()?;

        if !Self::is_date_token(date_token) || !Self::is_time_token(time_token) {
            return None;
        }

        let level = LogLevel::parse_value(level_token)?;

        let msg = if let Some(idx) = message.find(" - ") {
            Some(message[idx + 3..].to_string())
        } else {
            None
        };

        Some((msg, level))
    }

    fn is_date_token(token: &str) -> bool {
        let bytes = token.as_bytes();
        if bytes.len() != 10 {
            return false;
        }
        bytes[0..4].iter().all(|b| b.is_ascii_digit())
            && bytes[4] == b'-'
            && bytes[5..7].iter().all(|b| b.is_ascii_digit())
            && bytes[7] == b'-'
            && bytes[8..10].iter().all(|b| b.is_ascii_digit())
    }

    fn is_time_token(token: &str) -> bool {
        let bytes = token.as_bytes();
        if bytes.len() < 8 {
            return false;
        }
        bytes[0..2].iter().all(|b| b.is_ascii_digit())
            && bytes[2] == b':'
            && bytes[3..5].iter().all(|b| b.is_ascii_digit())
            && bytes[5] == b':'
            && bytes[6..8].iter().all(|b| b.is_ascii_digit())
    }

    fn extract_logfmt_value(
        fields: &BTreeMap<String, String>,
        keys: &[&str],
    ) -> Option<String> {
        for key in keys {
            if let Some(value) = fields.get(*key) {
                return Some(value.clone());
            }
        }
        None
    }

    fn parse_logfmt_fields(message: &str) -> Option<BTreeMap<String, String>> {
        let mut fields = BTreeMap::new();
        let mut chars = message.chars().peekable();

        loop {
            while let Some(ch) = chars.peek() {
                if ch.is_whitespace() {
                    chars.next();
                } else {
                    break;
                }
            }

            if chars.peek().is_none() {
                break;
            }

            let mut key = String::new();
            let mut saw_equal = false;
            while let Some(ch) = chars.peek() {
                if *ch == '=' {
                    chars.next();
                    saw_equal = true;
                    break;
                }
                if ch.is_whitespace() {
                    break;
                }
                key.push(*ch);
                chars.next();
            }

            if key.is_empty() || !saw_equal {
                break;
            }

            let mut value = String::new();
            if matches!(chars.peek(), Some(&'"')) {
                chars.next();
                while let Some(ch) = chars.next() {
                    if ch == '\\' {
                        if let Some(escaped) = chars.next() {
                            value.push(escaped);
                        }
                        continue;
                    }
                    if ch == '"' {
                        break;
                    }
                    value.push(ch);
                }
            } else {
                while let Some(ch) = chars.peek() {
                    if ch.is_whitespace() {
                        break;
                    }
                    value.push(*ch);
                    chars.next();
                }
            }

            if !key.is_empty() {
                fields.insert(key, value);
            }
        }

        if fields.is_empty() {
            None
        } else {
            Some(fields)
        }
    }
}

/// Log filter for searching and filtering logs
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    #[must_use]
    pub fn apply(&self, logs: &[LogLine]) -> Vec<LogLine> {
        logs.iter()
            .filter(|log| self.matches(log))
            .cloned()
            .collect()
    }

    /// Check if a log line matches the filter
    #[must_use]
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
                format: LogFormat::Plain,
                fields: None,
                raw: "ERROR: failed".to_string(),
                pod: "test".to_string(),
                container: "main".to_string(),
                namespace: "default".to_string(),
            },
            LogLine {
                timestamp: None,
                message: "INFO: success".to_string(),
                level: Some(LogLevel::Info),
                format: LogFormat::Plain,
                fields: None,
                raw: "INFO: success".to_string(),
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

    #[test]
    fn test_json_detection_requires_log_fields() {
        // Valid structured log - should detect as JSON
        let valid = r#"{"msg":"hello","level":"info"}"#;
        let (format, _, _, _) = LogStreamer::parse_structured_message(valid);
        assert_eq!(format, LogFormat::Json);

        // Arbitrary JSON without log fields - should NOT detect as JSON
        let arbitrary = r#"{"foo":"bar","count":42}"#;
        let (format, _, _, _) = LogStreamer::parse_structured_message(arbitrary);
        assert_eq!(format, LogFormat::Plain);
    }
}
