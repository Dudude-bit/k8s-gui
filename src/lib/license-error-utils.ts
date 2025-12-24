/**
 * Utility functions for handling license-related errors
 * 
 * Provides unified logic for detecting and handling license errors
 * across the application.
 */

import type { ToastActionElement } from "@/components/ui/toast";

/**
 * Check if an error is license-related
 */
export function isLicenseError(error: unknown): boolean {
  const errorStr = String(error).toLowerCase();
  return (
    errorStr.includes("license") ||
    errorStr.includes("premium") ||
    errorStr.includes("requires a valid license")
  );
}

/**
 * Create a toast configuration for license errors
 * Returns an object that can be used with toast(), with optional action
 */
export function createLicenseErrorToast(
  error: unknown,
  action?: ToastActionElement
) {
  const errorMessage = String(error);
  return {
    title: "Premium Feature",
    description: errorMessage,
    variant: "destructive" as const,
    ...(action && { action }),
  };
}

