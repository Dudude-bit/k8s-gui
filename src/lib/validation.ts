/**
 * Client-side validation utilities
 * 
 * These rules are synchronized with the backend validation in:
 * - auth-server/src/utils/validation.rs
 * - auth-server/src/utils/password.rs
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate email format
 * Synced with: auth-server/src/utils/validation.rs:validate_email
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || email.trim() === "") {
    return { isValid: false, error: "Email is required" };
  }
  if (!email.includes("@") || !email.includes(".")) {
    return { isValid: false, error: "Please enter a valid email address" };
  }
  if (email.length > 255) {
    return { isValid: false, error: "Email is too long (max 255 characters)" };
  }
  return { isValid: true };
}

/**
 * Password strength requirements
 */
export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  maxLength: 128,
  requireLowercase: true,
  requireUppercase: true,
  requireDigit: true,
  requireSpecial: true,
  specialChars: "!@#$%^&*()_+-=[]{}|;:,.<>?",
};

/**
 * Validate password strength
 * Synced with: auth-server/src/utils/password.rs:validate_password_strength
 */
export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { isValid: false, error: "Password is required" };
  }

  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    return {
      isValid: false,
      error: `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`,
    };
  }

  if (password.length > PASSWORD_REQUIREMENTS.maxLength) {
    return {
      isValid: false,
      error: `Password must be at most ${PASSWORD_REQUIREMENTS.maxLength} characters`,
    };
  }

  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    return {
      isValid: false,
      error: "Password must contain at least one lowercase letter",
    };
  }

  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    return {
      isValid: false,
      error: "Password must contain at least one uppercase letter",
    };
  }

  if (PASSWORD_REQUIREMENTS.requireDigit && !/\d/.test(password)) {
    return {
      isValid: false,
      error: "Password must contain at least one digit",
    };
  }

  if (PASSWORD_REQUIREMENTS.requireSpecial) {
    const hasSpecial = PASSWORD_REQUIREMENTS.specialChars
      .split("")
      .some((char) => password.includes(char));
    if (!hasSpecial) {
      return {
        isValid: false,
        error: "Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)",
      };
    }
  }

  return { isValid: true };
}

/**
 * Get password strength indicator (for UI feedback)
 */
export function getPasswordStrength(password: string): {
  strength: "weak" | "medium" | "strong";
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= PASSWORD_REQUIREMENTS.minLength) score++;
  else feedback.push(`At least ${PASSWORD_REQUIREMENTS.minLength} characters`);

  if (/[a-z]/.test(password)) score++;
  else feedback.push("One lowercase letter");

  if (/[A-Z]/.test(password)) score++;
  else feedback.push("One uppercase letter");

  if (/\d/.test(password)) score++;
  else feedback.push("One digit");

  const hasSpecial = PASSWORD_REQUIREMENTS.specialChars
    .split("")
    .some((char) => password.includes(char));
  if (hasSpecial) score++;
  else feedback.push("One special character");

  let strength: "weak" | "medium" | "strong" = "weak";
  if (score >= 5) strength = "strong";
  else if (score >= 3) strength = "medium";

  return { strength, score, feedback };
}

/**
 * Validate license key format (UUID format)
 * Synced with: auth-server/src/utils/validation.rs:validate_license_key
 */
export function validateLicenseKey(licenseKey: string): ValidationResult {
  if (!licenseKey || licenseKey.trim() === "") {
    return { isValid: false, error: "License key is required" };
  }

  const trimmedKey = licenseKey.trim();

  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars)
  if (trimmedKey.length !== 36) {
    return {
      isValid: false,
      error: "Invalid license key format. Expected UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
    };
  }

  // Validate UUID format with regex
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(trimmedKey)) {
    return {
      isValid: false,
      error: "Invalid license key format",
    };
  }

  return { isValid: true };
}

/**
 * Validate that two passwords match (for registration/password change)
 */
export function validatePasswordsMatch(
  password: string,
  confirmPassword: string
): ValidationResult {
  if (password !== confirmPassword) {
    return { isValid: false, error: "Passwords do not match" };
  }
  return { isValid: true };
}

/**
 * Validate a required field
 */
export function validateRequired(
  value: string | undefined | null,
  fieldName: string
): ValidationResult {
  if (!value || value.trim() === "") {
    return { isValid: false, error: `${fieldName} is required` };
  }
  return { isValid: true };
}

