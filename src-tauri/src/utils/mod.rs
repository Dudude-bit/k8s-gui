//! Utility functions and helpers

use chrono::{DateTime, Utc};
use k8s_openapi::apimachinery::pkg::apis::meta::v1::Time;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

/// Format duration in human-readable format (e.g., "5m", "2h", "3d")
pub fn format_duration(seconds: i64) -> String {
    if seconds < 60 {
        format!("{}s", seconds)
    } else if seconds < 3600 {
        format!("{}m", seconds / 60)
    } else if seconds < 86400 {
        format!("{}h", seconds / 3600)
    } else {
        format!("{}d", seconds / 86400)
    }
}

/// Format age from creation timestamp
pub fn format_age(created_at: &DateTime<Utc>) -> String {
    let now = Utc::now();
    let duration = now.signed_duration_since(*created_at);
    format_duration(duration.num_seconds())
}

/// Format age from Kubernetes Time.
pub fn format_k8s_age(created_at: Option<&Time>) -> String {
    match created_at {
        Some(time) => {
            let now = Utc::now();
            let created_time = chrono::DateTime::parse_from_rfc3339(&time.0.to_rfc3339())
                .map(|t| t.with_timezone(&Utc))
                .unwrap_or(now);
            format_age(&created_time)
        }
        None => "Unknown".to_string(),
    }
}

/// Normalize namespace input, returning None for "all namespaces".
pub fn normalize_namespace(namespace: Option<String>, fallback: String) -> Option<String> {
    if let Some(ns) = namespace {
        if ns.trim().is_empty() {
            None
        } else {
            Some(ns)
        }
    } else if fallback.trim().is_empty() {
        None
    } else {
        Some(fallback)
    }
}

/// Require a concrete namespace, returning an error when "all namespaces" is selected.
pub fn require_namespace(namespace: Option<String>, fallback: String) -> crate::error::Result<String> {
    normalize_namespace(namespace, fallback)
        .ok_or_else(|| crate::error::Error::InvalidInput(
            "Namespace is required for this operation when all namespaces is selected.".to_string()
        ))
}

/// Format bytes in human-readable format (e.g., "1.5 GB")
pub fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    const TB: u64 = GB * 1024;

    if bytes >= TB {
        format!("{:.1} TB", bytes as f64 / TB as f64)
    } else if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

/// Parse Kubernetes quantity string (e.g., "100m", "2Gi", "500Mi")
pub fn parse_quantity(quantity: &str) -> Option<u64> {
    let quantity = quantity.trim();
    
    // Handle CPU millicores (e.g., "100m", "500m")
    if quantity.ends_with('m') {
        return quantity[..quantity.len() - 1]
            .parse::<u64>()
            .ok();
    }
    
    // Handle memory with binary suffixes
    let suffixes = [
        ("Ki", 1024u64),
        ("Mi", 1024 * 1024),
        ("Gi", 1024 * 1024 * 1024),
        ("Ti", 1024 * 1024 * 1024 * 1024),
        ("K", 1000),
        ("M", 1000 * 1000),
        ("G", 1000 * 1000 * 1000),
        ("T", 1000 * 1000 * 1000 * 1000),
    ];

    for (suffix, multiplier) in &suffixes {
        if quantity.ends_with(suffix) {
            return quantity[..quantity.len() - suffix.len()]
                .parse::<u64>()
                .ok()
                .map(|v| v * multiplier);
        }
    }

    // Plain number
    quantity.parse().ok()
}

/// Format Kubernetes quantity for display
pub fn format_quantity(value: u64, unit: &str) -> String {
    match unit {
        "cpu" => {
            if value >= 1000 {
                format!("{}", value / 1000)
            } else {
                format!("{}m", value)
            }
        }
        "memory" => format_bytes(value),
        _ => value.to_string(),
    }
}

/// Truncate string with ellipsis
pub fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len - 3])
    }
}

/// Sanitize resource name for use in URLs/IDs
pub fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect()
}

// Compile regex patterns once at startup
static K8S_NAME_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$")
        .expect("Failed to compile Kubernetes name regex")
});

static K8S_LABEL_VALUE_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z0-9]([-_.a-zA-Z0-9]*[a-zA-Z0-9])?$")
        .expect("Failed to compile Kubernetes label value regex")
});

/// Check if a string is a valid Kubernetes name
pub fn is_valid_k8s_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 253 {
        return false;
    }

    K8S_NAME_REGEX.is_match(name)
}

/// Check if a string is a valid Kubernetes label value
pub fn is_valid_label_value(value: &str) -> bool {
    if value.is_empty() {
        return true; // Empty is valid
    }
    if value.len() > 63 {
        return false;
    }

    K8S_LABEL_VALUE_REGEX.is_match(value)
}

/// Parse label selector string into key-value pairs
pub fn parse_label_selector(selector: &str) -> Vec<(String, String)> {
    selector
        .split(',')
        .filter_map(|part| {
            let part = part.trim();
            if let Some(idx) = part.find('=') {
                let key = part[..idx].trim().to_string();
                let value = part[idx + 1..].trim().to_string();
                Some((key, value))
            } else {
                None
            }
        })
        .collect()
}

/// Build label selector string from key-value pairs
pub fn build_label_selector(labels: &[(String, String)]) -> String {
    labels
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join(",")
}

/// Pagination info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pagination {
    pub page: usize,
    pub per_page: usize,
    pub total: usize,
}

impl Pagination {
    pub fn new(page: usize, per_page: usize, total: usize) -> Self {
        Self { page, per_page, total }
    }

    pub fn total_pages(&self) -> usize {
        (self.total + self.per_page - 1) / self.per_page
    }

    pub fn has_next(&self) -> bool {
        self.page < self.total_pages()
    }

    pub fn has_prev(&self) -> bool {
        self.page > 1
    }

    pub fn offset(&self) -> usize {
        (self.page - 1) * self.per_page
    }
}

/// Apply pagination to a slice
pub fn paginate<T: Clone>(items: &[T], page: usize, per_page: usize) -> (Vec<T>, Pagination) {
    let total = items.len();
    let pagination = Pagination::new(page, per_page, total);
    
    let start = pagination.offset();
    let end = (start + per_page).min(total);
    
    let paginated = if start < total {
        items[start..end].to_vec()
    } else {
        vec![]
    };
    
    (paginated, pagination)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_duration() {
        assert_eq!(format_duration(30), "30s");
        assert_eq!(format_duration(90), "1m");
        assert_eq!(format_duration(3700), "1h");
        assert_eq!(format_duration(90000), "1d");
    }

    #[test]
    fn test_format_bytes() {
        assert_eq!(format_bytes(512), "512 B");
        assert_eq!(format_bytes(1536), "1.5 KB");
        assert_eq!(format_bytes(1610612736), "1.5 GB");
    }

    #[test]
    fn test_parse_quantity() {
        assert_eq!(parse_quantity("100m"), Some(100));
        assert_eq!(parse_quantity("1Gi"), Some(1073741824));
        assert_eq!(parse_quantity("500Mi"), Some(524288000));
        assert_eq!(parse_quantity("1000"), Some(1000));
    }

    #[test]
    fn test_truncate() {
        assert_eq!(truncate("hello", 10), "hello");
        assert_eq!(truncate("hello world", 8), "hello...");
    }

    #[test]
    fn test_is_valid_k8s_name() {
        assert!(is_valid_k8s_name("my-app"));
        assert!(is_valid_k8s_name("app123"));
        assert!(!is_valid_k8s_name("My-App"));
        assert!(!is_valid_k8s_name("-app"));
        assert!(!is_valid_k8s_name(""));
    }

    #[test]
    fn test_parse_label_selector() {
        let result = parse_label_selector("app=nginx, env=prod");
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], ("app".to_string(), "nginx".to_string()));
    }

    #[test]
    fn test_pagination() {
        let items: Vec<i32> = (1..=25).collect();
        let (page, pagination) = paginate(&items, 2, 10);
        
        assert_eq!(page, vec![11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
        assert_eq!(pagination.total_pages(), 3);
        assert!(pagination.has_next());
        assert!(pagination.has_prev());
    }

    #[test]
    fn test_normalize_namespace() {
        assert_eq!(
            normalize_namespace(Some("default".to_string()), "ignored".to_string()),
            Some("default".to_string())
        );
        assert_eq!(
            normalize_namespace(Some("".to_string()), "default".to_string()),
            None
        );
        assert_eq!(
            normalize_namespace(None, "default".to_string()),
            Some("default".to_string())
        );
        assert_eq!(normalize_namespace(None, "".to_string()), None);
    }

    #[test]
    fn test_require_namespace() {
        assert_eq!(
            require_namespace(Some("default".to_string()), "ignored".to_string()).unwrap(),
            "default".to_string()
        );
        assert!(require_namespace(Some("".to_string()), "default".to_string()).is_err());
        assert!(require_namespace(None, "".to_string()).is_err());
    }
}
