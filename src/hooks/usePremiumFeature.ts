import { useState, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import * as commands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";

interface UsePremiumFeatureResult {
  /** Whether the user has access to premium features */
  hasAccess: boolean;
  /** Function to check license validity */
  checkLicense: () => Promise<boolean>;
  /** Error message if license check fails */
  error: string | null;
  /** Whether license check is in progress */
  isLoading: boolean;
}

/**
 * Hook for checking premium feature access and license validity
 *
 * @returns Object with access status, check function, error, and loading state
 * @example
 * ```tsx
 * const { hasAccess, checkLicense, error, isLoading } = usePremiumFeature();
 * if (!hasAccess) {
 *   const isValid = await checkLicense();
 * }
 * ```
 */
export function usePremiumFeature(): UsePremiumFeatureResult {
  const { licenseStatus, checkLicenseStatus } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const hasAccess = licenseStatus?.isValid ?? false;

  const checkLicense = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // Check via Tauri command
      const isValid = await commands.isLicenseValid();

      if (!isValid) {
        // Refresh status to get latest info
        await checkLicenseStatus(true);

        // Get fresh status from store
        const status = useAuthStore.getState().licenseStatus;
        if (!status?.hasLicense) {
          setError(
            "Premium feature requires a license. Please purchase or activate a license."
          );
        } else if (status.hasLicense && !status.isValid) {
          if (status.subscriptionType === "monthly" && status.expiresAt) {
            const expired = new Date(status.expiresAt) < new Date();
            if (expired) {
              const expiryDate = new Date(
                status.expiresAt
              ).toLocaleDateString();
              setError(
                `Your monthly subscription expired on ${expiryDate}. Please renew to continue using premium features.`
              );
            } else {
              const expiryDate = new Date(
                status.expiresAt
              ).toLocaleDateString();
              setError(
                `Your monthly subscription expires on ${expiryDate}. Please renew before expiration.`
              );
            }
          } else {
            setError("Your license is not valid. Please contact support.");
          }
        } else {
          setError(
            "Premium feature requires a valid license. Please activate your license."
          );
        }
        setIsLoading(false);
        return false;
      }

      setIsLoading(false);
      return true;
    } catch (err) {
      const errorMessage = normalizeTauriError(err);
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
