//! Password hashing and validation utilities

use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::password_hash::{rand_core::OsRng, SaltString};
use validator::ValidationError;

/// Hash a password using Argon2
pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2.hash_password(password.as_bytes(), &salt)?;
    Ok(password_hash.to_string())
}

/// Verify a password against a hash
pub fn verify_password(password: &str, hash: &str) -> Result<bool, argon2::password_hash::Error> {
    let parsed_hash = PasswordHash::new(hash)?;
    let argon2 = Argon2::default();
    match argon2.verify_password(password.as_bytes(), &parsed_hash) {
        Ok(()) => Ok(true),
        Err(argon2::password_hash::Error::Password) => Ok(false),
        Err(e) => Err(e),
    }
}

/// Validate password strength
pub fn validate_password_strength(password: &str) -> Result<(), ValidationError> {
    if password.len() < 8 {
        return Err(ValidationError::new("password_too_short"));
    }
    if password.len() > 128 {
        return Err(ValidationError::new("password_too_long"));
    }
    if !password.chars().any(|c| c.is_ascii_lowercase()) {
        return Err(ValidationError::new("password_no_lowercase"));
    }
    if !password.chars().any(|c| c.is_ascii_uppercase()) {
        return Err(ValidationError::new("password_no_uppercase"));
    }
    if !password.chars().any(|c| c.is_ascii_digit()) {
        return Err(ValidationError::new("password_no_digit"));
    }
    if !password.chars().any(|c| "!@#$%^&*()_+-=[]{}|;:,.<>?".contains(c)) {
        return Err(ValidationError::new("password_no_special"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify() {
        let password = "TestPassword123!";
        let hash = hash_password(password).unwrap();
        assert!(verify_password(password, &hash).unwrap());
        assert!(!verify_password("wrong_password", &hash).unwrap());
    }

    #[test]
    fn test_password_validation() {
        assert!(validate_password_strength("TestPass123!").is_ok());
        assert!(validate_password_strength("short").is_err());
        assert!(validate_password_strength("nouppercase123!").is_err());
        assert!(validate_password_strength("NOLOWERCASE123!").is_err());
        assert!(validate_password_strength("NoDigits!").is_err());
        assert!(validate_password_strength("NoSpecial123").is_err());
    }
}

