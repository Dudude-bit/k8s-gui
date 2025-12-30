/**
 * Utility functions for handling license-related errors
 *
 * Provides unified logic for detecting and handling license errors
 * across the application.
 */

/**
 * Check if an error is license-related
 *
 * @param error - Error object or string to check
 * @returns true if the error is related to licensing, false otherwise
 */
export function isLicenseError(error: unknown): boolean {
  const errorStr = String(error).toLowerCase();
  return (
    errorStr.includes("license") ||
    errorStr.includes("premium") ||
    errorStr.includes("requires a valid license")
  );
}
