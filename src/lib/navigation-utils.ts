import type { NavigateFunction } from "react-router-dom";

/**
 * Normalize a path for comparison (remove trailing slashes, query params)
 */
export function normalizePath(path: string): string {
  try {
    const url = new URL(path, window.location.origin);
    return url.pathname.replace(/\/$/, "") || "/";
  } catch {
    return path.split("?")[0].replace(/\/$/, "") || "/";
  }
}

/**
 * Get a safe redirect path that is not the login page
 */
export function getSafeRedirectPath(
  redirectParam: string | null,
  currentPath: string,
): string {
  if (!redirectParam) {
    return "/";
  }

  const normalizedRedirect = normalizePath(redirectParam);
  const normalizedCurrent = normalizePath(currentPath);

  // Avoid redirecting to login or same path
  if (normalizedRedirect === normalizedCurrent || normalizedRedirect === "/login") {
    return "/";
  }

  return redirectParam;
}

/**
 * Navigate with fallback to history back or home
 */
export function navigateWithFallback(
  navigate: NavigateFunction,
  targetPath: string,
  currentPath: string,
): void {
  const normalizedTarget = normalizePath(targetPath);
  const normalizedCurrent = normalizePath(currentPath);

  // If target is valid and different from current/login
  if (normalizedTarget !== normalizedCurrent && normalizedTarget !== "/login") {
    navigate(targetPath, { replace: true });
    return;
  }

  // Fallback: try history back, otherwise go home
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate("/", { replace: true });
  }
}

/**
 * Navigate back in history or fallback to home
 */
export function navigateBack(navigate: NavigateFunction): void {
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate("/", { replace: true });
  }
}

