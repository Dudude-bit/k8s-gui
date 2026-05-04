//! Log data types: `LogLine`, `LogFormat`, `LogLevel`.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Single parsed log line.
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

/// Log format detected by the parser.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogFormat {
    Plain,
    Json,
    Logfmt,
    Klog,
    Logback,
}

/// Log level detected by the parser.
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
    /// Best-effort heuristic from a free-text message — used when no
    /// structured `level` field is available.
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

    /// Parse a level from a structured field value (e.g. `"info"` or
    /// `"WARN"`). Returns `None` for empty input so callers can
    /// distinguish "absent" from "Unknown".
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
