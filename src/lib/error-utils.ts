/**
 * Utility functions for handling Tauri errors
 */

/**
 * API error structure from auth-server
 */
export interface ApiError {
  error: string;
  code: number;
  error_code?: string;
}

/**
 * Normalize Tauri error to a readable string message
 * Tauri errors can be:
 * - String
 * - Error object with message property
 * - Object with code/message/error_code properties (from our Error type or API)
 * - Plain object
 */
export function normalizeTauriError(error: unknown): string {
  // If it's already a string, return it
  if (typeof error === "string") {
    return error;
  }

  // If it's an Error instance, return its message
  if (error instanceof Error) {
    return error.message;
  }

  // If it's an object, try to extract message
  if (error && typeof error === "object") {
    // Check for API error structure: { error, code, error_code }
    const err = error as Record<string, unknown>;
    
    // Check for API error structure first
    if (typeof err.error === "string" && err.error) {
      const errorCode = err.error_code && typeof err.error_code === "string" 
        ? `${err.error_code}: ` 
        : "";
      return `${errorCode}${err.error}`;
    }
    
    // Try message field (most common for Tauri errors)
    if (typeof err.message === "string" && err.message) {
      return err.message;
    }
    
    // Try to stringify the whole object for debugging
    try {
      const json = JSON.stringify(error);
      // If it's a valid JSON object with structure, try to extract meaningful info
      if (err.code && typeof err.code === "string") {
        return `${err.code}: ${err.message || json}`;
      }
      return json;
    } catch {
      // If stringification fails, return a generic message
      return "Unknown error occurred";
    }
  }

  // Fallback
  return String(error);
}

