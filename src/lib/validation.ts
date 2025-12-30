/**
 * Client-side validation utilities
 *
 * These functions use Tauri commands that delegate to k8s-gui-common/src/validation.rs,
 * ensuring consistency across all projects (src-tauri, auth-server, and frontend).
 *
 * All validation logic is centralized in k8s-gui-common for a single source of truth.
 */

import * as commands from "@/generated/commands";
import { normalizeTauriError } from "./error-utils";

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate email format
 *
 * Uses Tauri command that delegates to k8s-gui-common/src/validation.rs::validate_email
 * for consistency across all projects.
 *
 * @param email - Email address to validate
 * @returns Validation result with isValid flag and optional error message
 */
export async function validateEmail(email: string): Promise<ValidationResult> {
  try {
    await commands.validateEmailCommand(email);
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: normalizeTauriError(error),
    };
  }
}

/**
 * Password strength requirements
 *
 * Synchronized with: k8s-gui-common/src/validation.rs::PasswordRequirements
 * These values must match the Rust implementation.
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
 *
 * Uses Tauri command that delegates to k8s-gui-common/src/validation.rs::validate_password
 * for consistency across all projects.
 *
 * @param password - Password to validate
 * @returns Validation result with isValid flag and optional error message
 */
export async function validatePassword(password: string): Promise<ValidationResult> {
  try {
    await commands.validatePasswordCommand(password);
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: normalizeTauriError(error),
    };
  }
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
 *
 * Uses Tauri command that delegates to k8s-gui-common/src/validation.rs::validate_license_key
 * for consistency across all projects.
 *
 * @param licenseKey - License key to validate (must be in UUID format)
 * @returns Validation result with isValid flag and optional error message
 */
export async function validateLicenseKey(licenseKey: string): Promise<ValidationResult> {
  try {
    await commands.validateLicenseKeyCommand(licenseKey);
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: normalizeTauriError(error),
    };
  }
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
