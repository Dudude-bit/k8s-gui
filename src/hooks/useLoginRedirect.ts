import { useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import {
  getSafeRedirectPath,
  navigateWithFallback,
  navigateBack,
} from "@/lib/navigation-utils";

interface UseLoginRedirectResult {
  /** Handler to call after successful login */
  handleLoginSuccess: () => void;
  /** Handler for the back button */
  handleGoBack: () => void;
}

/**
 * Custom hook that encapsulates all login page redirect logic
 *
 * Handles:
 * - Auto-redirect when already authenticated
 * - Safe redirect after successful login
 * - Back button navigation with fallbacks
 */
export function useLoginRedirect(): UseLoginRedirectResult {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuthStore();

  const redirectParam = searchParams.get("redirect");

  // Redirect if already authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const safePath = getSafeRedirectPath(redirectParam, location.pathname);
    navigateWithFallback(navigate, safePath, location.pathname);
  }, [isAuthenticated, navigate, redirectParam, location.pathname]);

  const handleLoginSuccess = useCallback(() => {
    const safePath = getSafeRedirectPath(redirectParam, location.pathname);
    navigate(safePath, { replace: true });
  }, [navigate, redirectParam, location.pathname]);

  const handleGoBack = useCallback(() => {
    if (redirectParam && isAuthenticated) {
      const safePath = getSafeRedirectPath(redirectParam, location.pathname);
      navigateWithFallback(navigate, safePath, location.pathname);
      return;
    }

    navigateBack(navigate);
  }, [navigate, redirectParam, isAuthenticated, location.pathname]);

  return {
    handleLoginSuccess,
    handleGoBack,
  };
}

