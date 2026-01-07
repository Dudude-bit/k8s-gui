import { useState, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import * as commands from "@/generated/commands";
import type { UserProfile } from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";
import { AUTH_DISABLED } from "@/lib/flags";

/**
 * Hook for managing user profile
 *
 * Provides functionality to load and update user profile information.
 *
 * @returns Object containing user profile, loading state, error state, and methods
 */
export function useUserProfile() {
  const { userProfile, isAuthenticated, setUserProfile } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (AUTH_DISABLED) {
      return;
    }
    if (!isAuthenticated) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const profile = await commands.getUserProfile();
      setUserProfile(profile);
    } catch (err) {
      setError(normalizeTauriError(err));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, setUserProfile]);

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (AUTH_DISABLED) {
        if (userProfile) {
          setUserProfile({
            ...userProfile,
            firstName: updates.firstName ?? userProfile.firstName,
            lastName: updates.lastName ?? userProfile.lastName,
            company: updates.company ?? userProfile.company,
          });
        }
        return;
      }
      setIsLoading(true);
      setError(null);

      try {
        const updated = await commands.updateUserProfile(
          updates.firstName ?? null,
          updates.lastName ?? null,
          updates.company ?? null
        );
        setUserProfile(updated);
      } catch (err) {
        const errorMessage = normalizeTauriError(err);
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [setUserProfile, userProfile]
  );

  return {
    userProfile,
    isLoading,
    error,
    loadProfile,
    updateProfile,
  };
}
