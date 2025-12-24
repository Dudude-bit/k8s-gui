import { useState, useCallback } from "react";
import { useLicenseStore } from "@/stores/licenseStore";
import { invoke } from "@tauri-apps/api/core";

interface UsePremiumFeatureResult {
  hasAccess: boolean;
  checkLicense: () => Promise<boolean>;
  error: string | null;
  isLoading: boolean;
}

export function usePremiumFeature(): UsePremiumFeatureResult {
  const { licenseStatus, checkLicenseStatus } = useLicenseStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const hasAccess = licenseStatus?.is_valid ?? false;

  const checkLicense = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // Quick check first
      const isValid = await invoke<boolean>("is_license_valid");
      
      if (!isValid) {
        // Refresh status to get latest info
        await checkLicenseStatus(true);
        
        // Issue #15 Fix: Provide specific error messages based on license status
        const status = licenseStatus;
        if (!status?.has_license) {
          setError("Premium feature requires a license. Please purchase or activate a license.");
        } else if (status.has_license && !status.is_valid) {
          if (status.subscription_type === "monthly" && status.expires_at) {
            const expired = new Date(status.expires_at) < new Date();
            if (expired) {
              const expiryDate = new Date(status.expires_at).toLocaleDateString();
              setError(`Your monthly subscription expired on ${expiryDate}. Please renew to continue using premium features.`);
            } else {
              const expiryDate = new Date(status.expires_at).toLocaleDateString();
              setError(`Your monthly subscription expires on ${expiryDate}. Please renew before expiration.`);
            }
          } else {
            setError("Your license is not valid. Please contact support.");
          }
        } else {
          setError("Premium feature requires a valid license. Please activate your license.");
        }
        setIsLoading(false);
        return false;
      }

      setIsLoading(false);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setIsLoading(false);
      return false;
    }
  }, [checkLicenseStatus]);

  return {
    hasAccess,
    checkLicense,
    error,
    isLoading,
  };
}

