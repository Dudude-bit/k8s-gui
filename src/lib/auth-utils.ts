/**
 * JWT token utility functions
 * Note: These functions decode and check tokens client-side for UI purposes.
 * Token signature verification is handled by the backend.
 */

const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes before expiration

export interface JWTPayload {
  exp?: number;
  iat?: number;
  user_id?: string;
  [key: string]: unknown;
}

/**
 * Decode JWT token without verification (client-side only)
 * @param token JWT token string
 * @returns Decoded payload or null if invalid
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded) as JWTPayload;
  } catch (error) {
    console.error("Failed to decode JWT:", error);
    return null;
  }
}

/**
 * Get token expiration timestamp
 * @param token JWT token string
 * @returns Expiration timestamp in milliseconds, or null if invalid/not found
 */
export function getTokenExpiration(token: string): number | null {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) {
    return null;
  }
  // JWT exp is in seconds, convert to milliseconds
  return payload.exp * 1000;
}

/**
 * Check if token is expired
 * @param token JWT token string
 * @returns true if token is expired or invalid, false otherwise
 */
export function isTokenExpired(token: string): boolean {
  const expiration = getTokenExpiration(token);
  if (!expiration) {
    return true; // Invalid token is considered expired
  }
  return Date.now() >= expiration;
}

/**
 * Check if token is valid (not expired)
 * @param token JWT token string
 * @returns true if token is valid and not expired
 */
export function isTokenValid(token: string): boolean {
  if (!token || token.trim() === "") {
    return false;
  }
  return !isTokenExpired(token);
}

/**
 * Check if token should be refreshed (expires within threshold)
 * @param token JWT token string
 * @returns true if token should be refreshed
 */
export function shouldRefreshToken(token: string): boolean {
  const expiration = getTokenExpiration(token);
  if (!expiration) {
    return false; // Invalid token, can't refresh
  }
  const timeUntilExpiration = expiration - Date.now();
  return timeUntilExpiration > 0 && timeUntilExpiration <= TOKEN_REFRESH_THRESHOLD_MS;
}

/**
 * Get time until token expiration in milliseconds
 * @param token JWT token string
 * @returns Milliseconds until expiration, or null if invalid/expired
 */
export function getTimeUntilExpiration(token: string): number | null {
  const expiration = getTokenExpiration(token);
  if (!expiration) {
    return null;
  }
  const remaining = expiration - Date.now();
  return remaining > 0 ? remaining : null;
}

/**
 * Validate token format (basic check)
 * @param token Token string
 * @returns true if token has valid JWT format
 */
export function isValidTokenFormat(token: string): boolean {
  if (!token || typeof token !== "string") {
    return false;
  }
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

