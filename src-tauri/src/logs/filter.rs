//! Log filter — search query, level, time range, container, regex.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::types::{LogLevel, LogLine};

/// Filter applied to a list of log lines for searching / drill-down.
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
    /// Apply this filter to a slice of log lines, returning a new
    /// vec of clones for matching lines.
    #[must_use]
    pub fn apply(&self, logs: &[LogLine]) -> Vec<LogLine> {
        logs.iter()
            .filter(|log| self.matches(log))
            .cloned()
            .collect()
    }

    /// Predicate: does this line satisfy every set criterion?
    #[must_use]
    pub fn matches(&self, log: &LogLine) -> bool {
        if !self.containers.is_empty() && !self.containers.contains(&log.container) {
            return false;
        }

        if !self.levels.is_empty() {
            if let Some(level) = &log.level {
                if !self.levels.contains(level) {
                    return false;
                }
            }
        }

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
