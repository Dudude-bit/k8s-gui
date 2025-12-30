import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { Skeleton } from "@/components/ui/skeleton";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, loading, checkAuth } = useAuthStore();
  const [isChecking, setIsChecking] = useState(true);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    // Wait for initial loading to complete
    if (loading) {
      return;
    }

    // If already authenticated, skip check
    if (isAuthenticated) {
      setIsChecking(false);
      setHasChecked(true);
      return;
    }

    // Only check auth once on mount
    if (hasChecked) {
      return;
    }

    const verifyAuth = async () => {
      // If authenticated, skip check
      if (isAuthenticated) {
        setIsChecking(false);
        setHasChecked(true);
        return;
      }

      // Not authenticated, check auth state
      await checkAuth();
      setIsChecking(false);
      setHasChecked(true);
    };

    verifyAuth();
  }, [isAuthenticated, loading, checkAuth, hasChecked]);

  // Show loading state while checking authentication
  if (loading || isChecking) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    const redirectPath = location.pathname + location.search;
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(redirectPath)}`}
        replace
      />
    );
  }

  // Render protected content
  return <>{children}</>;
}
