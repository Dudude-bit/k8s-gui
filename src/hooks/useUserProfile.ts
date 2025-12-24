import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAuthStore, UserProfile } from "@/stores/authStore";

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
      const profile = await invoke<UserProfile>("get_user_profile");
      setUserProfile(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, setUserProfile]);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    setIsLoading(true);
    setError(null);

    try {
      const updated = await invoke<UserProfile>("update_user_profile", {
        first_name: updates.first_name,
        last_name: updates.last_name,
        company: updates.company,
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

