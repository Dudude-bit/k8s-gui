import { create } from "zustand";
import {
  AuthResponse,
  ProfileResponse,
  LicenseStatusResponse,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  refresh as apiRefresh,
  getStatus as apiGetStatus,
  activate as apiActivate,
  getProfile as apiGetProfile,
} from "@/lib/api/auth";
import {
  isTokenValid,
  shouldRefreshToken,
  isValidTokenFormat,
  getTimeUntilExpiration,
} from "@/lib/auth-utils";

// Re-export types for convenience
export type { AuthResponse, ProfileResponse, LicenseStatusResponse };

interface AuthState {
  // Token state
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;

  // User state
  user: ProfileResponse | null;
  userProfile: ProfileResponse | null; // Alias for user, for backward compatibility

  // License state
  licenseStatus: LicenseStatusResponse | null;
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
  setTokens: (tokens: AuthResponse) => void;
  clearTokens: () => void;
  initializeAuth: () => Promise<void>;

  // Actions - License
  initClient: (authServerUrl: string) => Promise<void>;
  checkLicenseStatus: (forceRefresh?: boolean) => Promise<void>;
  activateLicense: (licenseKey: string) => Promise<void>;
  refreshLicensePeriodically: () => (() => void);
  setUserProfile: (profile: ProfileResponse) => void;
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

    // Validate token format
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

  // Refresh 5 minutes before expiration
  const refreshTime = Math.max(
    timeUntilExpiration - 5 * 60 * 1000,
    60 * 1000, // At least 1 minute from now
  );

  return setTimeout(async () => {
    const success = await refreshFn();
    if (!success) {
      console.warn("Token refresh failed, user may need to re-login");
    }
  }, refreshTime);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state - Authentication
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  loading: false,
  error: null,
  user: null,
  userProfile: null,
  refreshTimerId: null,

  // Initial state - License
  licenseStatus: null,
  isCheckingLicense: false,
  licenseError: null,
  lastLicenseCheck: null,
  authServerUrl: null,
  refreshIntervalId: null,

  /**
   * Set tokens and update state
   */
  setTokens: (tokens: AuthResponse) => {
    const { accessToken, refreshToken } = tokens;
    const isValid = isTokenValid(accessToken);

    // Clear existing refresh timer
    const currentTimer = get().refreshTimerId;
    if (currentTimer) {
      clearTimeout(currentTimer);
    }

    // Save to storage
    saveTokensToStorage(accessToken, refreshToken);

    // Schedule refresh if token is valid
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

  /**
   * Clear tokens and reset state
   */
  clearTokens: () => {
    // Clear refresh timer
    const currentTimer = get().refreshTimerId;
    if (currentTimer) {
      clearTimeout(currentTimer);
    }

    // Clear license refresh interval
    const licenseInterval = get().refreshIntervalId;
    if (licenseInterval) {
      clearInterval(licenseInterval);
    }

    // Clear storage
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

  /**
   * Login user
   */
  login: async (email: string, password: string) => {
    set({ loading: true, error: null });

    try {
      // Call generated client to login
      const tokens = await apiLogin({ email, password });

      // Store tokens in React state
      get().setTokens(tokens);

      // Load user profile
      try {
        const userProfile = await apiGetProfile();
        set({ user: userProfile, userProfile });
      } catch (profileError) {
        console.warn("Failed to load user profile:", profileError);
        // Don't fail login if profile load fails
      }

      // Check license status after login
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

  /**
   * Register new user
   */
  register: async (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
  ) => {
    set({ loading: true, error: null });

    try {
      // Call generated client to register
      const tokens = await apiRegister({
        email,
        password,
        firstName,
        lastName,
      });

      // Store tokens in React state
      get().setTokens(tokens);

      // Load user profile
      try {
        const userProfile = await apiGetProfile();
        set({ user: userProfile, userProfile });
      } catch (profileError) {
        console.warn("Failed to load user profile:", profileError);
        // Don't fail registration if profile load fails
      }

      // Check license status after registration
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

  /**
   * Logout user
   */
  logout: async () => {
    const { refreshToken } = get();

    // Try to call backend logout (don't fail if it fails)
    if (refreshToken) {
      try {
        await apiLogout({ refreshToken });
      } catch (error) {
        console.warn("Backend logout failed:", error);
      }
    }

    // Clear tokens and state
    get().clearTokens();
  },

  /**
   * Refresh access token
   */
  refreshAccessToken: async (): Promise<boolean> => {
    const { refreshToken } = get();

    if (!refreshToken) {
      console.warn("No refresh token available");
      return false;
    }

    try {
      // Call generated client
      const tokens = await apiRefresh({ refreshToken });

      // Update tokens
      get().setTokens(tokens);
      return true;
    } catch (error) {
      console.error("Token refresh failed:", error);
      // If refresh fails, clear tokens (user needs to re-login)
      get().clearTokens();
      return false;
    }
  },

  /**
   * Check authentication status and validate tokens
   */
  checkAuth: async () => {
    const { accessToken, refreshToken } = get();

    // If no tokens, not authenticated
    if (!accessToken || !refreshToken) {
      set({ isAuthenticated: false });
      return;
    }

    // Check if access token is valid
    if (isTokenValid(accessToken)) {
      set({ isAuthenticated: true });
      return;
    }

    // Access token expired, try to refresh
    if (shouldRefreshToken(accessToken) || !isTokenValid(accessToken)) {
      const refreshed = await get().refreshAccessToken();
      if (refreshed) {
        set({ isAuthenticated: true });
      } else {
        set({ isAuthenticated: false });
      }
    } else {
      set({ isAuthenticated: false });
    }
  },

  /**
   * Initialize auth state from localStorage
   */
  initializeAuth: async () => {
    set({ loading: true });

    // Load tokens from storage
    const { accessToken, refreshToken } = loadTokensFromStorage();

    if (!accessToken || !refreshToken) {
      set({ loading: false, isAuthenticated: false });
      return;
    }

    // Set tokens in state
    set({ accessToken, refreshToken });

    // Check if tokens are valid
    await get().checkAuth();

    // Load user profile if authenticated
    if (get().isAuthenticated) {
      try {
        const userProfile = await apiGetProfile();
        set({ user: userProfile, userProfile });
      } catch (profileError) {
        console.warn("Failed to load user profile:", profileError);
        // If profile load fails, token might be invalid
        // Clear tokens to force re-login
        get().clearTokens();
      }
    }

    set({ loading: false });
  },

  /**
   * Initialize license client
   */
  initClient: async (authServerUrl: string) => {
    try {
      // Update global base URL if we were using it in a way that needs init
      // But Axios instance defaults to /api/v1 which is proxied
      // So we might not need this anymore unless we want to store the URL
      set({ authServerUrl });
      // Check license status after initialization
      await get().checkLicenseStatus();
    } catch (error) {
      console.error("Failed to initialize license client:", error);
      set({ licenseError: error instanceof Error ? error.message : String(error) });
    }
  },

  /**
   * Check license status
   */
  checkLicenseStatus: async (forceRefresh = false) => {
    const state = get();
    if (state.isCheckingLicense && !forceRefresh) {
      return;
    }

    set({ isCheckingLicense: true, licenseError: null });

    try {
      const status = await apiGetStatus();
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

  /**
   * Activate license
   */
  activateLicense: async (licenseKey: string) => {
    try {
      const status = await apiActivate({ licenseKey });
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

  /**
   * Refresh license periodically
   */
  refreshLicensePeriodically: () => {
    // Clear existing interval if any
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

  /**
   * Set user profile (for backward compatibility)
   */
  setUserProfile: (profile: ProfileResponse) => {
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
