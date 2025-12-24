import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface LicenseStatus {
  has_license: boolean;
  license_key: string | null;
  subscription_type: "monthly" | "infinite" | null;
  expires_at: string | null;
  is_valid: boolean;
}

export interface UserProfile {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  email_verified: boolean;
}

interface LicenseState {
  // License state
  licenseStatus: LicenseStatus | null;
  isCheckingLicense: boolean;
  licenseError: string | null;
  lastLicenseCheck: number | null;

  // User state
  isAuthenticated: boolean;
  userProfile: UserProfile | null;
  authServerUrl: string | null;

  // Issue #9 Fix: Track interval ID for cleanup
  refreshIntervalId: NodeJS.Timeout | null;

  // Actions
  initClient: (authServerUrl: string) => Promise<void>;
  checkLicenseStatus: (forceRefresh?: boolean) => Promise<void>;
  activateLicense: (licenseKey: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshLicensePeriodically: () => (() => void);
  setUserProfile: (profile: UserProfile) => void;
}

const LICENSE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

export const useLicenseStore = create<LicenseState>((set, get) => ({
  licenseStatus: null,
  isCheckingLicense: false,
  licenseError: null,
  lastLicenseCheck: null,
  isAuthenticated: false,
  userProfile: null,
  authServerUrl: null,
  refreshIntervalId: null,

  initClient: async (authServerUrl: string) => {
    try {
      await invoke("init_license_client", { authServerUrl });
      set({ authServerUrl });
      // Check license status after initialization
      await get().checkLicenseStatus();
    } catch (error) {
      console.error("Failed to initialize license client:", error);
      set({ licenseError: error instanceof Error ? error.message : String(error) });
    }
  },

  checkLicenseStatus: async (forceRefresh = false) => {
    const state = get();
    if (state.isCheckingLicense && !forceRefresh) {
      return;
    }

    set({ isCheckingLicense: true, licenseError: null });

    try {
      const status = await invoke<LicenseStatus>("check_license_status", {
        forceRefresh,
      });
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
        licenseError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  activateLicense: async (licenseKey: string) => {
    try {
      const status = await invoke<LicenseStatus>("activate_license", {
        licenseKey,
      });
      set({
        licenseStatus: status,
        licenseError: null,
      });
      // Issue #17 Fix: Success feedback will be handled by component via toast
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ licenseError: errorMessage });
      // Issue #17 Fix: Error feedback will be handled by component via toast
      throw error;
    }
  },

  login: async (email: string, password: string) => {
    try {
      await invoke("login_user", { email, password });
      set({ isAuthenticated: true });
      // Check license status after login
      await get().checkLicenseStatus(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ licenseError: errorMessage });
      throw error;
    }
  },

  register: async (email: string, password: string, firstName?: string, lastName?: string) => {
    try {
      await invoke("register_user", { email, password, firstName, lastName });
      set({ isAuthenticated: true });
      // Check license status after registration
      await get().checkLicenseStatus(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ licenseError: errorMessage });
      throw error;
    }
  },

  logout: async () => {
    set({
      isAuthenticated: false,
      userProfile: null,
      setUserProfile: (profile) => set({ userProfile: profile }),
      licenseStatus: null,
    });
  },

  refreshLicensePeriodically: () => {
    // Issue #9 Fix: Clear existing interval if any
    const state = get();
    if (state.refreshIntervalId) {
      clearInterval(state.refreshIntervalId);
    }

    const interval = setInterval(() => {
      const currentState = get();
      if (currentState.authServerUrl && currentState.isAuthenticated) {
        currentState.checkLicenseStatus();
      }
    }, LICENSE_CHECK_INTERVAL);

    set({ refreshIntervalId: interval });

    // Return cleanup function
    return () => {
      const currentState = get();
      if (currentState.refreshIntervalId) {
        clearInterval(currentState.refreshIntervalId);
        set({ refreshIntervalId: null });
      }
    };
  },

  setUserProfile: (profile) => set({ userProfile: profile }),
}));

// Initialize license check on app start
if (typeof window !== "undefined") {
  // Check if we need to initialize (you can set this via env or config)
  // Use environment variable if available, otherwise default to localhost
  const authServerUrl = (import.meta as any).env?.VITE_AUTH_SERVER_URL || "http://localhost:8080";
  if (authServerUrl) {
    useLicenseStore.getState().initClient(authServerUrl).catch(console.error);
  }
}

