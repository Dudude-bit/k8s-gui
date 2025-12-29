//! Input validation utilities

use validator::ValidationError;

/// Validate email format
pub fn validate_email(email: &str) -> Result<(), ValidationError> {
    if !email.contains('@') || !email.contains('.') {
        return Err(ValidationError::new("invalid_email"));
    }
    if email.len() > 255 {
        return Err(ValidationError::new("email_too_long"));
    }
    Ok(())
}

/// Validate license key format (UUID format)
pub fn validate_license_key(key: &str) -> Result<(), ValidationError> {
    if key.len() != 36 {
        return Err(ValidationError::new("invalid_license_key_format"));
    }
    uuid::Uuid::parse_str(key)
        .map_err(|_| ValidationError::new("invalid_license_key_format"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_email_validation() {
        assert!(validate_email("test@example.com").is_ok());
        assert!(validate_email("invalid").is_err());
        assert!(validate_email("no@domain").is_err());
    }

    #[test]
    fn test_license_key_validation() {
        let valid_key = "550e8400-e29b-41d4-a716-446655440000";
        assert!(validate_license_key(valid_key).is_ok());
        assert!(validate_license_key("invalid").is_err());
        assert!(validate_license_key("").is_err());
    }
}

