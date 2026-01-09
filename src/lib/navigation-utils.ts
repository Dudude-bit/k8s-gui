import type { NavigateFunction } from "react-router-dom";
import { toPlural, type ResourceKind } from "./resource-registry";

/**
 * Get the URL for a resource detail page
 *
 * @param resourceKind - The kind of the resource (e.g., "Pod", "Deployment")
 * @param name - Name of the resource
 * @param namespace - Namespace of the resource (optional for cluster-scoped resources)
 * @returns URL path for the resource detail page
 *
 * @example
 * getResourceDetailUrl("Pod", "my-pod", "default") // "/pods/default/my-pod"
 * getResourceDetailUrl("Node", "node-1") // "/nodes/node-1"
 */
export function getResourceDetailUrl(
  resourceKind: ResourceKind | string,
  name: string,
  namespace?: string | null
): string {
  const plural = toPlural(resourceKind as ResourceKind);
  if (namespace) {
    return `/${plural}/${namespace}/${name}`;
  }
  return `/${plural}/${name}`;
}

/**
 * Get the URL for a resource list page
 *
 * @param resourceKind - The kind of the resource
 * @returns URL path for the resource list page
 *
 * @example
 * getResourceListUrl("Pod") // "/pods"
 * getResourceListUrl("Deployment") // "/deployments"
 */
export function getResourceListUrl(resourceKind: ResourceKind | string): string {
  return `/${toPlural(resourceKind as ResourceKind)}`;
}
/**
 * Normalize a path for comparison (remove trailing slashes, query params)
 *
 * @param path - Path string to normalize
 * @returns Normalized path without trailing slashes or query parameters
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
 *
 * @param redirectParam - Redirect parameter from URL or null
 * @param currentPath - Current pathname
 * @returns Safe redirect path, defaults to "/" if redirect is invalid or same as current
 */
export function getSafeRedirectPath(
  redirectParam: string | null,
  currentPath: string
): string {
  if (!redirectParam) {
    return "/";
  }

  const normalizedRedirect = normalizePath(redirectParam);
  const normalizedCurrent = normalizePath(currentPath);

  // Avoid redirecting to login or same path
  if (
    normalizedRedirect === normalizedCurrent ||
    normalizedRedirect === "/login"
  ) {
    return "/";
  }

  return redirectParam;
}

/**
 * Navigate with fallback to history back or home
 *
 * @param navigate - React Router navigate function
 * @param targetPath - Target path to navigate to
 * @param currentPath - Current pathname
 */
export function navigateWithFallback(
  navigate: NavigateFunction,
  targetPath: string,
  currentPath: string
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
 *
 * @param navigate - React Router navigate function
 */
export function navigateBack(navigate: NavigateFunction): void {
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate("/", { replace: true });
  }
}
