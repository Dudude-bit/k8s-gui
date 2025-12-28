import { useState, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import { getProfile as apiGetProfile, updateProfile as apiUpdateProfile, ProfileResponse } from "@/lib/api/auth";

export function useUserProfile() {
  const { userProfile, isAuthenticated, setUserProfile } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const profile = await apiGetProfile();
      setUserProfile(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, setUserProfile]);

  const updateProfile = useCallback(async (updates: Partial<ProfileResponse>) => {
    setIsLoading(true);
    setError(null);

    try {
      // Create request object from updates
      const updated = await apiUpdateProfile({
        firstName: updates.firstName ?? null,
        lastName: updates.lastName ?? null,
        company: updates.company ?? null,
      });
      setUserProfile(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUserProfile]);

  return {
    userProfile,
    isLoading,
    error,
    loadProfile,
    updateProfile,
  };
}

