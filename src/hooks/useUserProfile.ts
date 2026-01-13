import { useState, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import { commands } from "@/lib/commands";
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
  const { user, isAuthenticated, setUser } = useAuthStore();
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
      setUser(profile);
    } catch (err) {
      setError(normalizeTauriError(err));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, setUser]);

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (AUTH_DISABLED) {
        if (user) {
          setUser({
            ...user,
            firstName: updates.firstName ?? user.firstName,
            lastName: updates.lastName ?? user.lastName,
            company: updates.company ?? user.company,
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
        setUser(updated);
      } catch (err) {
        const errorMessage = normalizeTauriError(err);
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [setUser, user]
  );

  return {
    userProfile: user,
    isLoading,
    error,
    loadProfile,
    updateProfile,
  };
}
