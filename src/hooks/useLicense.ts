import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";

export function useLicense() {
  const { licenseStatus, isCheckingLicense, licenseError, checkLicenseStatus } =
    useAuthStore();

  useEffect(() => {
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
  }, [checkLicenseStatus]);

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
