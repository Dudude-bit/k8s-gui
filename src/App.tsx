import { lazy, Suspense, useCallback, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PageSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Layout } from "@/components/layout/Layout";
import { useAuthFlowEvents } from "@/hooks/useAuthFlowEvents";
import { useClusterErrorToasts } from "@/hooks/useClusterErrorToasts";
import { useGlobalErrorToasts } from "@/hooks/useGlobalErrorToasts";
import { usePortForwardEvents } from "@/hooks/usePortForwardEvents";
import { usePortForwardStore } from "@/stores/portForwardStore";
import { useThemeStore } from "@/stores/themeStore";
import { setupFrontendLogger } from "@/lib/frontend-logger";
import { logInfo } from "@/lib/logger";

// Lazy load all pages for code splitting
const ClusterOverview = lazy(() =>
  import("@/pages/ClusterOverview").then((m) => ({
    default: m.ClusterOverview,
  }))
);
const Workloads = lazy(() =>
  import("@/pages/Workloads").then((m) => ({ default: m.Workloads }))
);
const Network = lazy(() =>
  import("@/pages/Network").then((m) => ({ default: m.Network }))
);
const Storage = lazy(() =>
  import("@/pages/Storage").then((m) => ({ default: m.Storage }))
);
const Configuration = lazy(() =>
  import("@/pages/Configuration").then((m) => ({ default: m.Configuration }))
);
const Nodes = lazy(() =>
  import("@/pages/Nodes").then((m) => ({ default: m.Nodes }))
);
const Events = lazy(() =>
  import("@/pages/Events").then((m) => ({ default: m.Events }))
);
const Helm = lazy(() =>
  import("@/pages/Helm").then((m) => ({ default: m.Helm }))
);
const Settings = lazy(() =>
  import("@/pages/Settings").then((m) => ({ default: m.Settings }))
);
const Profile = lazy(() =>
  import("@/pages/Profile").then((m) => ({ default: m.Profile }))
);
const PodDetail = lazy(() =>
  import("@/pages/PodDetail").then((m) => ({ default: m.PodDetail }))
);
const DeploymentDetail = lazy(() =>
  import("@/pages/DeploymentDetail").then((m) => ({
    default: m.DeploymentDetail,
  }))
);
const ServiceDetail = lazy(() =>
  import("@/pages/ServiceDetail").then((m) => ({ default: m.ServiceDetail }))
);
const NodeDetail = lazy(() =>
  import("@/pages/NodeDetail").then((m) => ({ default: m.NodeDetail }))
);
const Login = lazy(() =>
  import("@/pages/Login").then((m) => ({ default: m.Login }))
);
import { useLicense } from "@/hooks/useLicense";

export default function App() {
  const { theme } = useThemeStore();
  const location = useLocation();
  const { toast } = useToast();
  const hydratePortForwards = usePortForwardStore((state) => state.hydrate);

  useGlobalErrorToasts();
  useClusterErrorToasts();
  useAuthFlowEvents();
  usePortForwardEvents();
  // Initialize license check on app start
  useLicense();

  useEffect(() => {
    const cleanup = setupFrontendLogger();
    return () => {
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    hydratePortForwards();
  }, [hydratePortForwards]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  useEffect(() => {
    logInfo("Route change", {
      context: "router",
      data: { path: location.pathname },
    });
  }, [location.pathname]);

  const handleError = useCallback(
    (error: Error) => {
      toast({
        title: "Unexpected error",
        description: error.message || "Something went wrong while rendering.",
        variant: "destructive",
      });
    },
    [toast]
  );

  return (
    <ErrorBoundary resetKey={location.pathname} onError={handleError}>
      <Routes>
        <Route
          path="/login"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <Login />
            </Suspense>
          }
        />
        <Route path="/" element={<Layout />}>
          <Route index element={<ClusterOverview />} />
          <Route path="workloads/*" element={<Workloads />} />
          <Route path="network/*" element={<Network />} />
          <Route path="storage/*" element={<Storage />} />
          <Route path="configuration/*" element={<Configuration />} />
          <Route path="nodes" element={<Nodes />} />
          <Route path="nodes/:name" element={<NodeDetail />} />
          <Route path="events" element={<Events />} />
          <Route path="helm" element={<Helm />} />
          <Route path="settings" element={<Settings />} />
          <Route
            path="profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route path="pod/:namespace/:name" element={<PodDetail />} />
          <Route
            path="deployment/:namespace/:name"
            element={<DeploymentDetail />}
          />
          <Route path="service/:namespace/:name" element={<ServiceDetail />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
