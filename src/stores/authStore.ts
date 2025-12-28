import { create } from "zustand";
import * as commands from "@/generated/commands";
import type { AuthTokens, LicenseStatus, UserProfile } from "@/generated/types";
import {
  isTokenValid,
  shouldRefreshToken,
  isValidTokenFormat,
  getTimeUntilExpiration,
} from "@/lib/auth-utils";

// Re-export types for convenience
export type { AuthTokens, LicenseStatus, UserProfile };

interface AuthState {
  // Token state
  accessToken: string | null;
  refreshToken: string | null;
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

  // Token refresh
  refreshTimerId: NodeJS.Timeout | null;
  refreshIntervalId: NodeJS.Timeout | null;

  // Actions - Authentication
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
  checkAuth: () => Promise<void>;
  setTokens: (tokens: AuthTokens) => void;
  clearTokens: () => void;
  initializeAuth: () => Promise<void>;

  // Actions - License
  initClient: (authServerUrl: string) => Promise<void>;
  checkLicenseStatus: (forceRefresh?: boolean) => Promise<void>;
  activateLicense: (licenseKey: string) => Promise<void>;
  refreshLicensePeriodically: () => (() => void);
  setUserProfile: (profile: UserProfile) => void;
}

const STORAGE_KEYS = {
  ACCESS_TOKEN: "auth_access_token",
  REFRESH_TOKEN: "auth_refresh_token",
} as const;

const LICENSE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

/**
 * Load tokens from localStorage
 */
function loadTokensFromStorage(): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null };
  }

  try {
    const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);

    const validAccessToken =
      accessToken && isValidTokenFormat(accessToken) ? accessToken : null;
    const validRefreshToken =
      refreshToken && isValidTokenFormat(refreshToken) ? refreshToken : null;

    return {
      accessToken: validAccessToken,
      refreshToken: validRefreshToken,
    };
  } catch (error) {
    console.error("Failed to load tokens from storage:", error);
    return { accessToken: null, refreshToken: null };
  }
}

/**
 * Save tokens to localStorage
 */
function saveTokensToStorage(
  accessToken: string | null,
  refreshToken: string | null,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (accessToken) {
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    }

    if (refreshToken) {
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    } else {
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    }
  } catch (error) {
    console.error("Failed to save tokens to storage:", error);
  }
}

/**
 * Clear tokens from localStorage
 */
function clearTokensFromStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  } catch (error) {
    console.error("Failed to clear tokens from storage:", error);
  }
}

/**
 * Schedule token refresh based on expiration time
 */
function scheduleTokenRefresh(
  accessToken: string,
  refreshFn: () => Promise<boolean>,
): NodeJS.Timeout | null {
  const timeUntilExpiration = getTimeUntilExpiration(accessToken);
  if (!timeUntilExpiration) {
    return null;
  }

  const refreshTime = Math.max(
    timeUntilExpiration - 5 * 60 * 1000,
    60 * 1000,
  );

  return setTimeout(async () => {
    const success = await refreshFn();
    if (!success) {
      console.warn("Token refresh failed, user may need to re-login");
    }
  }, refreshTime);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  loading: false,
  error: null,
  user: null,
  userProfile: null,
  refreshTimerId: null,
  licenseStatus: null,
  isCheckingLicense: false,
  licenseError: null,
  lastLicenseCheck: null,
  authServerUrl: null,
  refreshIntervalId: null,

  setTokens: (tokens: AuthTokens) => {
    const { accessToken, refreshToken } = tokens;
    const isValid = isTokenValid(accessToken);

    const currentTimer = get().refreshTimerId;
    if (currentTimer) {
      clearTimeout(currentTimer);
    }

    saveTokensToStorage(accessToken, refreshToken);

    let refreshTimerId: NodeJS.Timeout | null = null;
    if (isValid) {
      refreshTimerId = scheduleTokenRefresh(accessToken, () =>
        get().refreshAccessToken(),
      );
    }

    set({
      accessToken,
      refreshToken,
      isAuthenticated: isValid,
      refreshTimerId,
      error: null,
    });
  },

  clearTokens: () => {
    const currentTimer = get().refreshTimerId;
    if (currentTimer) {
      clearTimeout(currentTimer);
    }

    const licenseInterval = get().refreshIntervalId;
    if (licenseInterval) {
      clearInterval(licenseInterval);
    }

    clearTokensFromStorage();

    set({
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      user: null,
      userProfile: null,
      refreshTimerId: null,
      refreshIntervalId: null,
      licenseStatus: null,
      error: null,
    });
  },

  login: async (email: string, password: string) => {
    set({ loading: true, error: null });

    try {
      // Call Tauri command
      const tokens = await commands.loginUser(email, password);

      get().setTokens(tokens);

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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      set({
        loading: false,
        error: errorMessage,
        isAuthenticated: false,
        licenseError: errorMessage,
      });
      throw error;
    }
  },

  register: async (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
  ) => {
    set({ loading: true, error: null });

    try {
      // Call Tauri command
      const tokens = await commands.registerUser(email, password, firstName ?? null, lastName ?? null);

      get().setTokens(tokens);

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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      set({
        loading: false,
        error: errorMessage,
        isAuthenticated: false,
        licenseError: errorMessage,
      });
      throw error;
    }
  },

  logout: async () => {
    // Clear tokens and state (no backend logout command for now)
    get().clearTokens();
  },

  refreshAccessToken: async (): Promise<boolean> => {
    // Token refresh is handled by Tauri LicenseClient internally
    // For now, just check if we're still authenticated
    const { accessToken } = get();
    if (!accessToken) {
      return false;
    }

    if (isTokenValid(accessToken)) {
      return true;
    }

    // Token expired, clear and return false
    get().clearTokens();
    return false;
  },

  checkAuth: async () => {
    const { accessToken, refreshToken } = get();

    if (!accessToken || !refreshToken) {
      set({ isAuthenticated: false });
      return;
    }

    if (isTokenValid(accessToken)) {
      set({ isAuthenticated: true });
      return;
    }

    if (shouldRefreshToken(accessToken) || !isTokenValid(accessToken)) {
      const refreshed = await get().refreshAccessToken();
      set({ isAuthenticated: refreshed });
    } else {
      set({ isAuthenticated: false });
    }
  },

  initializeAuth: async () => {
    set({ loading: true });

    const { accessToken, refreshToken } = loadTokensFromStorage();

    if (!accessToken || !refreshToken) {
      set({ loading: false, isAuthenticated: false });
      return;
    }

    set({ accessToken, refreshToken });

    await get().checkAuth();

    if (get().isAuthenticated) {
      try {
        const userProfile = await commands.getUserProfile();
        set({ user: userProfile, userProfile });
      } catch (profileError) {
        console.warn("Failed to load user profile:", profileError);
        get().clearTokens();
      }
    }

    set({ loading: false });
  },

  initClient: async (authServerUrl: string) => {
    try {
      // Initialize Tauri license client
      await commands.initLicenseClient(authServerUrl);
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
        licenseError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  activateLicense: async (licenseKey: string) => {
    try {
      const status = await commands.activateLicense(licenseKey);
      set({
        licenseStatus: status,
        licenseError: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ licenseError: errorMessage });
      throw error;
    }
  },

  refreshLicensePeriodically: () => {
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

    return () => {
      const currentState = get();
      if (currentState.refreshIntervalId) {
        clearInterval(currentState.refreshIntervalId);
        set({ refreshIntervalId: null });
      }
    };
  },

  setUserProfile: (profile: UserProfile) => {
    set({ userProfile: profile, user: profile });
  },
}));

// Initialize auth on store creation
if (typeof window !== "undefined") {
  useAuthStore.getState().initializeAuth().catch(console.error);

  // Initialize license client
  const authServerUrl =
    (import.meta as any).env?.VITE_AUTH_SERVER_URL || "http://localhost:8080";
  if (authServerUrl) {
    useAuthStore.getState().initClient(authServerUrl).catch(console.error);
  }
}
