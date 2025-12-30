//! Input validation utilities

use validator::ValidationError;

/// Validate email format with proper structure checks
pub fn validate_email(email: &str) -> Result<(), ValidationError> {
    // Check length limits
    if email.is_empty() {
        return Err(ValidationError::new("email_empty"));
    }
    if email.len() > 255 {
        return Err(ValidationError::new("email_too_long"));
    }
    
    // Must contain exactly one @
    let at_count = email.chars().filter(|c| *c == '@').count();
    if at_count != 1 {
        return Err(ValidationError::new("invalid_email"));
    }
    
    // Split into local and domain parts
    let parts: Vec<&str> = email.split('@').collect();
    if parts.len() != 2 {
        return Err(ValidationError::new("invalid_email"));
    }
    
    let local = parts[0];
    let domain = parts[1];
    
    // Local part must not be empty and must be reasonable length
    if local.is_empty() || local.len() > 64 {
        return Err(ValidationError::new("invalid_email_local"));
    }
    
    // Domain must not be empty and must contain at least one dot
    if domain.is_empty() || !domain.contains('.') {
        return Err(ValidationError::new("invalid_email_domain"));
    }
    
    // Domain must not start or end with a dot
    if domain.starts_with('.') || domain.ends_with('.') {
        return Err(ValidationError::new("invalid_email_domain"));
    }
    
    // Domain parts must not be empty (no consecutive dots)
    for part in domain.split('.') {
        if part.is_empty() {
            return Err(ValidationError::new("invalid_email_domain"));
        }
    }
    
    // TLD must be at least 2 characters
    let tld = domain.split('.').last().unwrap_or("");
    if tld.len() < 2 {
        return Err(ValidationError::new("invalid_email_tld"));
    }
    
    Ok(())
}

/// Validate and sanitize pagination parameters
/// Returns (limit, offset) with values clamped to valid ranges
pub fn validate_pagination(limit: Option<i32>, offset: Option<i32>, max_limit: i64) -> (i64, i64) {
    let limit = limit.unwrap_or(50).max(0).min(max_limit as i32) as i64;
    let offset = offset.unwrap_or(0).max(0) as i64;
    (limit, offset)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_email_validation_valid() {
        assert!(validate_email("test@example.com").is_ok());
        assert!(validate_email("user.name@domain.org").is_ok());
        assert!(validate_email("user+tag@example.co.uk").is_ok());
        assert!(validate_email("a@b.co").is_ok());
    }

    #[test]
    fn test_email_validation_invalid() {
        assert!(validate_email("").is_err());
        assert!(validate_email("invalid").is_err());
        assert!(validate_email("no@domain").is_err());
        assert!(validate_email("@.").is_err());
        assert!(validate_email("a@.com").is_err());
        assert!(validate_email("a@com.").is_err());
        assert!(validate_email("a@b..com").is_err());
        assert!(validate_email("@@example.com").is_err());
        assert!(validate_email("a@b.c").is_err()); // TLD too short
    }

    #[test]
    fn test_pagination_validation() {
        assert_eq!(validate_pagination(None, None, 100), (50, 0));
        assert_eq!(validate_pagination(Some(10), Some(20), 100), (10, 20));
        assert_eq!(validate_pagination(Some(-5), Some(-10), 100), (0, 0));
        assert_eq!(validate_pagination(Some(200), Some(0), 100), (100, 0));
    }
}

