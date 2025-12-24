import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";

export function useLicense() {
  const {
    licenseStatus,
    isCheckingLicense,
    licenseError,
    checkLicenseStatus,
    refreshLicensePeriodically,
  } = useAuthStore();

  useEffect(() => {
    // Check license on mount
    checkLicenseStatus();

    // Set up periodic refresh
    const cleanup = refreshLicensePeriodically();
    return cleanup;
  }, [checkLicenseStatus, refreshLicensePeriodically]);

  const hasValidLicense = licenseStatus?.is_valid ?? false;
  const hasLicense = licenseStatus?.has_license ?? false;

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

