//! Input validation for Kubernetes resources

use crate::error::{Error, Result};
use crate::utils::{is_valid_k8s_name, is_valid_label_value};

/// Validate a Kubernetes resource name (DNS-1123 subdomain)
pub fn validate_resource_name(name: &str) -> Result<()> {
    if name.is_empty() {
        return Err(Error::InvalidInput("Resource name cannot be empty".to_string()));
    }

    if name.len() > 253 {
        return Err(Error::InvalidInput(format!(
            "Resource name '{}' exceeds maximum length of 253 characters",
            name
        )));
    }

    if !is_valid_k8s_name(name) {
        return Err(Error::InvalidInput(format!(
            "Resource name '{}' is not a valid DNS-1123 subdomain. Must be lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character",
            name
        )));
    }

    Ok(())
}

/// Validate a Kubernetes namespace name (DNS-1123 label)
pub fn validate_namespace(name: &str) -> Result<()> {
    if name.is_empty() {
        return Err(Error::InvalidInput("Namespace name cannot be empty".to_string()));
    }

    if name.len() > 63 {
        return Err(Error::InvalidInput(format!(
            "Namespace name '{}' exceeds maximum length of 63 characters",
            name
        )));
    }

    if !is_valid_k8s_name(name) {
        return Err(Error::InvalidInput(format!(
            "Namespace name '{}' is not a valid DNS-1123 label. Must be lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character",
            name
        )));
    }

    Ok(())
}

/// Validate a port number (1-65535)
pub fn validate_port(port: u16) -> Result<()> {
    if port == 0 {
        return Err(Error::InvalidInput("Port number cannot be 0".to_string()));
    }

    if port > 65535 {
        return Err(Error::InvalidInput(format!(
            "Port number {} exceeds maximum value of 65535",
            port
        )));
    }

    Ok(())
}

/// Validate a label key
pub fn validate_label_key(key: &str) -> Result<()> {
    if key.is_empty() {
        return Err(Error::InvalidInput("Label key cannot be empty".to_string()));
    }

    if key.len() > 63 {
        return Err(Error::InvalidInput(format!(
            "Label key '{}' exceeds maximum length of 63 characters",
            key
        )));
    }

    // Label keys can have a prefix separated by '/'
    let parts: Vec<&str> = key.split('/').collect();
    if parts.len() > 2 {
        return Err(Error::InvalidInput(format!(
            "Label key '{}' has invalid format. Must be 'prefix/name' or 'name'",
            key
        )));
    }

    for part in parts {
        if !is_valid_k8s_name(part) {
            return Err(Error::InvalidInput(format!(
                "Label key part '{}' in '{}' is not valid",
                part, key
            )));
        }
    }

    Ok(())
}

/// Validate a label value
pub fn validate_label(label_value: &str) -> Result<()> {
    if !is_valid_label_value(label_value) {
        return Err(Error::InvalidInput(format!(
            "Label value '{}' is not valid. Must be empty or an alphanumeric string with '-', '_', or '.' allowed, max 63 characters",
            label_value
        )));
    }

    Ok(())
}

/// Validate a label selector string
pub fn validate_label_selector(selector: &str) -> Result<()> {
    if selector.is_empty() {
        return Ok(()); // Empty selector is valid
    }

    // Basic validation - check for common patterns
    // Full validation would require parsing the selector
    if selector.len() > 1000 {
        return Err(Error::InvalidInput(
            "Label selector exceeds maximum length".to_string(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_resource_name() {
        assert!(validate_resource_name("valid-name").is_ok());
        assert!(validate_resource_name("valid-name-123").is_ok());
        assert!(validate_resource_name("").is_err());
        assert!(validate_resource_name("Invalid-Name").is_err()); // Uppercase
        assert!(validate_resource_name("-invalid").is_err()); // Starts with dash
        assert!(validate_resource_name("invalid-").is_err()); // Ends with dash
    }

    #[test]
    fn test_validate_port() {
        assert!(validate_port(1).is_ok());
        assert!(validate_port(8080).is_ok());
        assert!(validate_port(65535).is_ok());
        assert!(validate_port(0).is_err());
    }

    #[test]
    fn test_validate_label_key() {
        assert!(validate_label_key("app").is_ok());
        assert!(validate_label_key("app/name").is_ok());
        assert!(validate_label_key("").is_err());
        assert!(validate_label_key("app/name/extra").is_err());
    }
}

