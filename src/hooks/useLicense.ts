/**
 * License Hook
 *
 * Provides license status management with automatic periodic refresh.
 * Checks license status on mount and every 5 minutes thereafter.
 *
 * @module hooks/useLicense
 */

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";

/**
 * Hook for managing license status
 *
 * @returns License state and actions
 * @example
 * ```tsx
 * const { hasValidLicense, licenseStatus, refresh } = useLicense();
 *
 * if (!hasValidLicense) {
 *   return <UpgradePrompt />;
 * }
 * ```
 */
export function useLicense() {
  const {
    licenseStatus,
    isCheckingLicense,
    licenseError,
    checkLicenseStatus,
    isAuthenticated,
  } = useAuthStore();

  useEffect(() => {
    // Only check license if user is authenticated
    if (!isAuthenticated) {
      return;
    }

    // Check license on mount
    checkLicenseStatus();

    // Set up periodic refresh (every 5 minutes)
    const interval = setInterval(
      () => {
        checkLicenseStatus();
      },
      5 * 60 * 1000
    );

    return () => clearInterval(interval);
  }, [checkLicenseStatus, isAuthenticated]);

  const hasValidLicense = licenseStatus?.isValid ?? false;
  const hasLicense = licenseStatus?.hasLicense ?? false;

  return {
    licenseStatus,
    isCheckingLicense,
    licenseError,
    hasValidLicense,
    hasLicense,
    checkLicenseStatus,
    refresh: () => checkLicenseStatus(true),
  };
}
