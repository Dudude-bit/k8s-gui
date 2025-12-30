//! Input validation for Kubernetes resources

use crate::error::{Error, Result};
use crate::utils::is_valid_k8s_name;

/// Validate a Kubernetes resource name (DNS-1123 subdomain)
pub fn validate_resource_name(name: &str) -> Result<()> {
    if name.is_empty() {
        return Err(Error::InvalidInput("Resource name cannot be empty".to_string()));
    }

    if name.len() > 253 {
        return Err(Error::InvalidInput(format!(
            "Resource name '{name}' exceeds maximum length of 253 characters"
        )));
    }

    if !is_valid_k8s_name(name) {
        return Err(Error::InvalidInput(format!(
            "Resource name '{name}' is not a valid DNS-1123 subdomain. Must be lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character"
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
            "Namespace name '{name}' exceeds maximum length of 63 characters"
        )));
    }

    if !is_valid_k8s_name(name) {
        return Err(Error::InvalidInput(format!(
            "Namespace name '{name}' is not a valid DNS-1123 label. Must be lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character"
        )));
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

}

