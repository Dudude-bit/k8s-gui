//! Input validation utilities
//!
//! This module provides unified validation logic used across all K8s GUI projects.
//! All validation rules are centralized here to ensure consistency and eliminate duplication.

/// Validation result with error message
pub type ValidationResult = Result<(), String>;

/// Validate email format with proper structure checks
///
/// This function implements comprehensive email validation:
/// - Checks length limits (max 255 characters)
/// - Validates email structure (local@domain format)
/// - Validates domain structure (must contain TLD, no consecutive dots, etc.)
///
/// # Examples
///
/// ```
/// use k8s_gui_common::validation::validate_email;
///
/// assert!(validate_email("test@example.com").is_ok());
/// assert!(validate_email("invalid").is_err());
/// ```
pub fn validate_email(email: &str) -> ValidationResult {
    // Check length limits
    if email.is_empty() {
        return Err("Email is required".to_string());
    }
    if email.len() > 255 {
        return Err("Email is too long (max 255 characters)".to_string());
    }

    // Must contain exactly one @
    let at_count = email.chars().filter(|c| *c == '@').count();
    if at_count != 1 {
        return Err("Please enter a valid email address".to_string());
    }

    // Split into local and domain parts
    let parts: Vec<&str> = email.split('@').collect();
    if parts.len() != 2 {
        return Err("Please enter a valid email address".to_string());
    }

    let local = parts[0];
    let domain = parts[1];

    // Local part must not be empty and must be reasonable length
    if local.is_empty() || local.len() > 64 {
        return Err("Please enter a valid email address".to_string());
    }

    // Domain must not be empty and must contain at least one dot
    if domain.is_empty() || !domain.contains('.') {
        return Err("Please enter a valid email address".to_string());
    }

    // Domain must not start or end with a dot
    if domain.starts_with('.') || domain.ends_with('.') {
        return Err("Please enter a valid email address".to_string());
    }

    // Domain parts must not be empty (no consecutive dots)
    for part in domain.split('.') {
        if part.is_empty() {
            return Err("Please enter a valid email address".to_string());
        }
    }

    // TLD must be at least 2 characters
    let tld = domain.split('.').next_back().unwrap_or("");
    if tld.len() < 2 {
        return Err("Please enter a valid email address".to_string());
    }

    Ok(())
}

/// Password strength requirements
pub struct PasswordRequirements {
    pub min_length: usize,
    pub max_length: usize,
    pub require_lowercase: bool,
    pub require_uppercase: bool,
    pub require_digit: bool,
    pub require_special: bool,
    pub special_chars: &'static str,
}

impl Default for PasswordRequirements {
    fn default() -> Self {
        Self {
            min_length: 8,
            max_length: 128,
            require_lowercase: true,
            require_uppercase: true,
            require_digit: true,
            require_special: true,
            special_chars: "!@#$%^&*()_+-=[]{}|;:,.<>?",
        }
    }
}

/// Validate password strength
///
/// This function validates password according to security requirements:
/// - Minimum length: 8 characters
/// - Maximum length: 128 characters
/// - Must contain at least one lowercase letter
/// - Must contain at least one uppercase letter
/// - Must contain at least one digit
/// - Must contain at least one special character
///
/// # Examples
///
/// ```
/// use k8s_gui_common::validation::validate_password;
///
/// assert!(validate_password("TestPass123!").is_ok());
/// assert!(validate_password("short").is_err());
/// ```
pub fn validate_password(password: &str) -> ValidationResult {
    validate_password_with_requirements(password, &PasswordRequirements::default())
}

/// Validate password with custom requirements
pub fn validate_password_with_requirements(
    password: &str,
    requirements: &PasswordRequirements,
) -> ValidationResult {
    if password.is_empty() {
        return Err("Password is required".to_string());
    }

    if password.len() < requirements.min_length {
        return Err(format!(
            "Password must be at least {} characters",
            requirements.min_length
        ));
    }

    if password.len() > requirements.max_length {
        return Err(format!(
            "Password must be at most {} characters",
            requirements.max_length
        ));
    }

    if requirements.require_lowercase && !password.chars().any(|c| c.is_ascii_lowercase()) {
        return Err("Password must contain at least one lowercase letter".to_string());
    }

    if requirements.require_uppercase && !password.chars().any(|c| c.is_ascii_uppercase()) {
        return Err("Password must contain at least one uppercase letter".to_string());
    }

    if requirements.require_digit && !password.chars().any(|c| c.is_ascii_digit()) {
        return Err("Password must contain at least one digit".to_string());
    }

    if requirements.require_special {
        let has_special = password
            .chars()
            .any(|c| requirements.special_chars.contains(c));
        if !has_special {
            return Err(format!(
                "Password must contain at least one special character ({})",
                requirements.special_chars
            ));
        }
    }

    Ok(())
}

/// Validate license key format (UUID format)
///
/// Validates that the license key is in UUID format:
/// - Must be exactly 36 characters
/// - Must match UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
///
/// # Examples
///
/// ```
/// use k8s_gui_common::validation::validate_license_key;
///
/// assert!(validate_license_key("550e8400-e29b-41d4-a716-446655440000").is_ok());
/// assert!(validate_license_key("invalid").is_err());
/// ```
pub fn validate_license_key(license_key: &str) -> ValidationResult {
    if license_key.trim().is_empty() {
        return Err("License key is required".to_string());
    }

    let trimmed = license_key.trim();

    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars)
    if trimmed.len() != 36 {
        return Err(
            "Invalid license key format. Expected UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)"
                .to_string(),
        );
    }

    // Validate UUID format with regex-like check
    let parts: Vec<&str> = trimmed.split('-').collect();
    if parts.len() != 5 {
        return Err("Invalid license key format".to_string());
    }

    // Check each part
    if parts[0].len() != 8
        || parts[1].len() != 4
        || parts[2].len() != 4
        || parts[3].len() != 4
        || parts[4].len() != 12
    {
        return Err("Invalid license key format".to_string());
    }

    // Check that all characters are hex digits
    let full_key = trimmed.replace('-', "");
    if !full_key.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid license key format".to_string());
    }

    Ok(())
}

/// Validate and sanitize pagination parameters
///
/// This function validates and sanitizes pagination parameters by:
/// - Setting default values if not provided (limit: 50, offset: 0)
/// - Clamping limit to valid range (0 to max_limit)
/// - Clamping offset to valid range (>= 0)
///
/// # Arguments
///
/// * `limit` - Optional limit value (default: 50)
/// * `offset` - Optional offset value (default: 0)
/// * `max_limit` - Maximum allowed limit value
///
/// # Returns
///
/// A tuple `(limit, offset)` with sanitized values.
///
/// # Examples
///
/// ```
/// use k8s_gui_common::validation::validate_pagination;
///
/// assert_eq!(validate_pagination(None, None, 100), (50, 0));
/// assert_eq!(validate_pagination(Some(10), Some(20), 100), (10, 20));
/// assert_eq!(validate_pagination(Some(-5), Some(-10), 100), (0, 0));
/// assert_eq!(validate_pagination(Some(200), Some(0), 100), (100, 0));
/// ```
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
    fn test_password_validation() {
        assert!(validate_password("TestPass123!").is_ok());
        assert!(validate_password("short").is_err());
        assert!(validate_password("nouppercase123!").is_err());
        assert!(validate_password("NOLOWERCASE123!").is_err());
        assert!(validate_password("NoDigits!").is_err());
        assert!(validate_password("NoSpecial123").is_err());
    }

    #[test]
    fn test_license_key_validation() {
        assert!(validate_license_key("550e8400-e29b-41d4-a716-446655440000").is_ok());
        assert!(validate_license_key("550E8400-E29B-41D4-A716-446655440000").is_ok());
        assert!(validate_license_key("").is_err());
        assert!(validate_license_key("invalid").is_err());
        assert!(validate_license_key("550e8400-e29b-41d4-a716").is_err()); // Too short
        assert!(validate_license_key("550e8400-e29b-41d4-a716-446655440000-extra").is_err()); // Too long
        assert!(validate_license_key("550e8400-e29b-41d4-a716-44665544000g").is_err());
        // Invalid char
    }

    #[test]
    fn test_pagination_validation() {
        assert_eq!(validate_pagination(None, None, 100), (50, 0));
        assert_eq!(validate_pagination(Some(10), Some(20), 100), (10, 20));
        assert_eq!(validate_pagination(Some(-5), Some(-10), 100), (0, 0));
        assert_eq!(validate_pagination(Some(200), Some(0), 100), (100, 0));
    }
}
