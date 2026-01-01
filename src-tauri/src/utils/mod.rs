//! Utility functions and helpers

pub mod quantities;

pub use quantities::{format_cpu, format_memory, parse_cpu, parse_memory};

use k8s_openapi::apimachinery::pkg::apis::meta::v1::Time;
use regex::Regex;

/// Format age from Kubernetes Time.
#[must_use]
pub fn format_k8s_age(created_at: Option<&Time>) -> String {
    let parsed = created_at
        .and_then(|time| chrono::DateTime::parse_from_rfc3339(&time.0.to_rfc3339()).ok())
        .map(|t| t.with_timezone(&chrono::Utc));
    k8s_gui_common::datetime::format_age(parsed.as_ref())
}

/// Normalize namespace input, returning None for "all namespaces".
#[must_use]
pub fn normalize_namespace(namespace: Option<String>, fallback: String) -> Option<String> {
    normalize_optional_namespace(namespace)
        .or_else(|| normalize_optional_namespace(Some(fallback)))
}

/// Normalize optional namespace input, returning None for empty/whitespace.
#[must_use]
pub fn normalize_optional_namespace(namespace: Option<String>) -> Option<String> {
    namespace.and_then(|ns| {
        let trimmed = ns.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

/// Require a concrete namespace, returning an error when "all namespaces" is selected.
///
/// # Errors
///
/// Returns an error if both namespace and fallback are empty or represent "all namespaces".
pub fn require_namespace(
    namespace: Option<String>,
    fallback: String,
) -> crate::error::Result<String> {
    normalize_namespace(namespace, fallback).ok_or_else(|| {
        crate::error::Error::InvalidInput(
            "Namespace is required for this operation when all namespaces is selected.".to_string(),
        )
    })
}

// Compile regex patterns once at startup
static K8S_NAME_REGEX: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$").expect("Failed to compile Kubernetes name regex")
});

/// Check if a string is a valid Kubernetes name
pub fn is_valid_k8s_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 253 {
        return false;
    }

    K8S_NAME_REGEX.is_match(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_valid_k8s_name() {
        assert!(is_valid_k8s_name("my-app"));
        assert!(is_valid_k8s_name("app123"));
        assert!(!is_valid_k8s_name("My-App"));
        assert!(!is_valid_k8s_name("-app"));
        assert!(!is_valid_k8s_name(""));
    }

    #[test]
    fn test_normalize_namespace() {
        assert_eq!(
            normalize_namespace(Some("default".to_string()), "ignored".to_string()),
            Some("default".to_string())
        );
        // Empty string falls back to fallback
        assert_eq!(
            normalize_namespace(Some("".to_string()), "default".to_string()),
            Some("default".to_string())
        );
        assert_eq!(
            normalize_namespace(None, "default".to_string()),
            Some("default".to_string())
        );
        // Both empty - returns None
        assert_eq!(normalize_namespace(None, "".to_string()), None);
        assert_eq!(
            normalize_namespace(Some("".to_string()), "".to_string()),
            None
        );
    }

    #[test]
    fn test_normalize_optional_namespace() {
        assert_eq!(
            normalize_optional_namespace(Some("default".to_string())),
            Some("default".to_string())
        );
        assert_eq!(normalize_optional_namespace(Some(" ".to_string())), None);
        assert_eq!(
            normalize_optional_namespace(Some(" kube-system ".to_string())),
            Some("kube-system".to_string())
        );
        assert_eq!(normalize_optional_namespace(None), None);
    }

    #[test]
    fn test_require_namespace() {
        assert_eq!(
            require_namespace(Some("default".to_string()), "ignored".to_string()).unwrap(),
            "default".to_string()
        );
        // Empty namespace falls back to fallback successfully
        assert_eq!(
            require_namespace(Some("".to_string()), "default".to_string()).unwrap(),
            "default".to_string()
        );
        // Both empty - error
        assert!(require_namespace(None, "".to_string()).is_err());
        assert!(require_namespace(Some("".to_string()), "".to_string()).is_err());
    }
}
