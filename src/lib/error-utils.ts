/**
 * Utility functions for handling Tauri errors
 */

/**
 * Normalize Tauri error to a readable string message
 *
 * Tauri errors can be:
 * - String
 * - Error object with message property
 * - Object with code/message/error_code properties (from our Error type or API)
 * - Plain object
 *
 * @param error - Error to normalize (can be any type)
 * @returns Normalized error message as string
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
      const errorCode =
        err.error_code && typeof err.error_code === "string"
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

/**
 * Check if an error is related to premium features or authentication
 *
 * @param errorMessage - Normalized error message to check
 * @returns true if this is a premium/auth error that should be handled gracefully
 */
export function isPremiumFeatureError(errorMessage: string): boolean {
  const lowerMessage = errorMessage.toLowerCase();
  return (
    lowerMessage.includes("not authenticated") ||
    lowerMessage.includes("license") ||
    lowerMessage.includes("premium")
  );
}

/**
 * Handle errors from premium feature queries gracefully
 *
 * For premium features that are optional (like metrics), we want to:
 * - Return a fallback value if user is not authenticated or lacks license
 * - Throw the error for other unexpected failures
 *
 * @param error - The caught error
 * @param fallback - Fallback value to return for premium/auth errors
 * @returns The fallback value if it's a premium error
 * @throws The original error if it's not a premium-related error
 *
 * @example
 * ```ts
 * try {
 *   return await commands.getPodsMetrics(namespace);
 * } catch (err) {
 *   return handlePremiumQueryError(err, []);
 * }
 * ```
 */
export function handlePremiumQueryError<T>(error: unknown, fallback: T): T {
  const errorMessage = normalizeTauriError(error);

  if (isPremiumFeatureError(errorMessage)) {
    return fallback;
  }

  throw new Error(errorMessage);
}
