/**
 * Authentication Store
 *
 * Manages user authentication state, session handling, and license status.
 * Handles login/logout/registration flows and persists authentication
 * through the Tauri backend keychain.
 *
 * @module stores/authStore
 */

import { create } from "zustand";
import * as commands from "@/generated/commands";
import type { LicenseStatus, UserProfile } from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";
import { AUTH_DISABLED } from "@/lib/flags";

// Re-export types for convenience
export type { LicenseStatus, UserProfile };

/** Authentication store state and actions */
interface AuthState {
  // Token state (kept in memory for UI awareness, but authoritative source is backend)
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;

  // User state
  user: UserProfile | null;
  userProfile: UserProfile | null;

  // License state
  licenseStatus: LicenseStatus | null;
  isCheckingLicense: boolean;
  licenseError: string | null;
  lastLicenseCheck: number | null;
  authServerUrl: string | null;

  // Actions - Authentication
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  initializeAuth: () => Promise<void>;

  // Actions - License
  checkLicenseStatus: (forceRefresh?: boolean) => Promise<void>;
  activateLicense: (licenseKey: string) => Promise<void>;
  setUserProfile: (profile: UserProfile) => void;
}

const DISABLED_LICENSE_STATUS: LicenseStatus = {
  hasLicense: true,
  licenseKey: null,
  subscriptionType: "lifetime",
  expiresAt: null,
  isValid: true,
};

const DISABLED_USER_PROFILE: UserProfile = {
  userId: "local",
  email: "offline@local",
  firstName: null,
  lastName: null,
  company: null,
  emailVerified: true,
};

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  isAuthenticated: AUTH_DISABLED,
  loading: false,
  error: null,
  user: AUTH_DISABLED ? DISABLED_USER_PROFILE : null,
  userProfile: AUTH_DISABLED ? DISABLED_USER_PROFILE : null,
  licenseStatus: AUTH_DISABLED ? DISABLED_LICENSE_STATUS : null,
  isCheckingLicense: false,
  licenseError: null,
  lastLicenseCheck: null,
  authServerUrl: null,

  login: async (email: string, password: string) => {
    if (AUTH_DISABLED) {
      set({
        isAuthenticated: true,
        user: DISABLED_USER_PROFILE,
        userProfile: DISABLED_USER_PROFILE,
        licenseStatus: DISABLED_LICENSE_STATUS,
        loading: false,
        error: null,
        licenseError: null,
      });
      return;
    }
    set({ loading: true, error: null });

    try {
      // Call Tauri command - backend now handles token storage in keychain
      await commands.loginUser(email, password);

      set({ isAuthenticated: true });

      // Load user profile
      try {
        const userProfile = await commands.getUserProfile();
        set({ user: userProfile, userProfile });
      } catch (profileError) {
        console.warn("Failed to load user profile:", profileError);
      }

      // Check license status
      await get().checkLicenseStatus(true);

      set({ loading: false });
    } catch (error) {
      const errorMessage = normalizeTauriError(error);
      set({
        loading: false,
        error: errorMessage,
        isAuthenticated: false,
        licenseError: errorMessage,
      });
      throw new Error(errorMessage);
    }
  },

  register: async (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string
  ) => {
    if (AUTH_DISABLED) {
      set({
        isAuthenticated: true,
        user: DISABLED_USER_PROFILE,
        userProfile: DISABLED_USER_PROFILE,
        licenseStatus: DISABLED_LICENSE_STATUS,
        loading: false,
        error: null,
        licenseError: null,
      });
      return;
    }
    set({ loading: true, error: null });

    try {
      // Call Tauri command - backend now handles token storage in keychain
      await commands.registerUser(
        email,
        password,
        firstName ?? null,
        lastName ?? null
      );

      set({ isAuthenticated: true });

      // Load user profile
      try {
        const userProfile = await commands.getUserProfile();
        set({ user: userProfile, userProfile });
      } catch (profileError) {
        console.warn("Failed to load user profile:", profileError);
      }

      // Check license status
      await get().checkLicenseStatus(true);

      set({ loading: false });
    } catch (error) {
      const errorMessage = normalizeTauriError(error);
      set({
        loading: false,
        error: errorMessage,
        isAuthenticated: false,
        licenseError: errorMessage,
      });
      throw new Error(errorMessage);
    }
  },

  logout: async () => {
    if (AUTH_DISABLED) {
      set({
        isAuthenticated: true,
        user: DISABLED_USER_PROFILE,
        userProfile: DISABLED_USER_PROFILE,
        licenseStatus: DISABLED_LICENSE_STATUS,
        error: null,
      });
      return;
    }
    // Clear tokens and state
    try {
      await commands.logoutUser();
    } catch (e) {
      console.error("Failed to logout backend:", e);
    }

    set({
      isAuthenticated: false,
      user: null,
      userProfile: null,
      licenseStatus: null,
      error: null,
    });
  },

  checkAuth: async () => {
    if (AUTH_DISABLED) {
      set({
        isAuthenticated: true,
        user: DISABLED_USER_PROFILE,
        userProfile: DISABLED_USER_PROFILE,
      });
      return;
    }
    // Backend handles token validation. We just try to get profile.
    try {
      const userProfile = await commands.getUserProfile();
      set({ isAuthenticated: true, user: userProfile, userProfile });
    } catch (e) {
      set({ isAuthenticated: false, user: null, userProfile: null });
    }
  },

  initializeAuth: async () => {
    if (AUTH_DISABLED) {
      set({
        isAuthenticated: true,
        user: DISABLED_USER_PROFILE,
        userProfile: DISABLED_USER_PROFILE,
        licenseStatus: DISABLED_LICENSE_STATUS,
        loading: false,
      });
      return;
    }
    set({ loading: true });

    // Try to restore session from backend (it will load from keychain)
    try {
      // We try to get user profile. If successful, we are authenticated.
      const userProfile = await commands.getUserProfile();
      set({
        isAuthenticated: true,
        user: userProfile,
        userProfile,
        loading: false,
      });

      // Also check license
      get().checkLicenseStatus();
    } catch (error) {
      // Not authenticated or token expired
      set({
        isAuthenticated: false,
        loading: false,
      });
    }
  },

  checkLicenseStatus: async (forceRefresh = false) => {
    if (AUTH_DISABLED) {
      set({
        licenseStatus: DISABLED_LICENSE_STATUS,
        isCheckingLicense: false,
        lastLicenseCheck: Date.now(),
        licenseError: null,
      });
      return;
    }
    const state = get();

    // Don't check license if not authenticated
    if (!state.isAuthenticated) {
      return;
    }

    if (state.isCheckingLicense && !forceRefresh) {
      return;
    }

    set({ isCheckingLicense: true, licenseError: null });

    try {
      const status = await commands.checkLicenseStatus(forceRefresh);
      set({
        licenseStatus: status,
        isCheckingLicense: false,
        lastLicenseCheck: Date.now(),
        licenseError: null,
      });
    } catch (error) {
      console.error("Failed to check license status:", error);
      set({
        isCheckingLicense: false,
        licenseError: normalizeTauriError(error),
      });
    }
  },

  activateLicense: async (licenseKey: string) => {
    if (AUTH_DISABLED) {
      set({
        licenseStatus: DISABLED_LICENSE_STATUS,
        licenseError: null,
      });
      return;
    }
    try {
      const status = await commands.activateLicense(licenseKey);
      set({
        licenseStatus: status,
        licenseError: null,
      });
    } catch (error) {
      const errorMessage = normalizeTauriError(error);
      set({ licenseError: errorMessage });
      throw new Error(errorMessage);
    }
  },

  setUserProfile: (profile: UserProfile) => {
    set({ userProfile: profile, user: profile });
  },
}));

// Initialize auth on store creation
if (typeof window !== "undefined") {
  const store = useAuthStore.getState();
  store.initializeAuth().catch(console.error);
}
