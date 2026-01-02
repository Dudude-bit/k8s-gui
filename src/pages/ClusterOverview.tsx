import { useQuery, keepPreviousData } from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import { useClusterStore } from "@/stores/clusterStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HeaderSkeleton, StatsSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Box,
  Server,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { Link } from "react-router-dom";
import { useClusterMetrics } from "@/hooks/useClusterMetrics";
import { usePodMetrics } from "@/hooks/usePodMetrics";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { MetricCard } from "@/components/ui/metric-card";
import { LicenseErrorBanner } from "@/components/license/LicenseErrorBanner";
import { getTopPodsByCPU, getTopPodsByMemory } from "@/lib/k8s-quantity";
import { useMemo } from "react";
import { normalizeTauriError } from "@/lib/error-utils";

export function ClusterOverview() {
  const { isConnected, currentContext, currentNamespace } = useClusterStore();

  const { data: clusterInfo, isLoading: isLoadingCluster } = useQuery({
    queryKey: ["cluster-info", currentContext],
    queryFn: async () => {
      try {
        if (!currentContext) return null;
        return await commands.getClusterInfo(currentContext);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: isConnected && !!currentContext,
    placeholderData: keepPreviousData,
  });

  // Single efficient stats call with smooth transitions
  const {
    data: stats,
    isLoading: isLoadingStats,
    isFetching,
  } = useQuery({
    queryKey: ["overview-stats", currentContext, currentNamespace],
    queryFn: async () => {
      try {
        return await commands.getClusterStats(currentNamespace);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: isConnected,
    staleTime: 10000, // 10 seconds cache
    placeholderData: keepPreviousData, // Keep showing previous data while loading
  });

  // Check premium feature access
  const { hasAccess } = usePremiumFeature();

  // Get cluster metrics (only if user has premium access)
  const { data: clusterMetrics } = useClusterMetrics({
    enabled: hasAccess,
  });

  // Get all pod metrics for top pods (only if user has premium access)
  const { data: allPodMetrics = [] } = usePodMetrics(undefined, {
    enabled: hasAccess,
  });

  // Get all pods
  const { data: allPods = [] } = useQuery({
    queryKey: ["pods", undefined],
    queryFn: async () => {
      try {
        const result = await commands.listPods({
          namespace: null,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
          statusFilter: null,
        });
        return result;
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 10000,
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
  });

  // Merge pods with metrics
  const podsWithMetrics = useMemo(() => {
    return allPods.map((pod) => {
      const metrics = allPodMetrics.find(
        (m) => m.name === pod.name && m.namespace === pod.namespace
      );
      return {
        ...pod,
        cpuUsage: metrics?.cpuUsage ?? pod.cpuUsage ?? null,
        memoryUsage: metrics?.memoryUsage ?? pod.memoryUsage ?? null,
      };
    });
  }, [allPods, allPodMetrics]);

  // Calculate top pods by CPU and Memory
  const topPodsByCPU = useMemo(() => {
    return getTopPodsByCPU(podsWithMetrics, 5);
  }, [podsWithMetrics]);

  const topPodsByMemory = useMemo(() => {
    return getTopPodsByMemory(podsWithMetrics, 5);
  }, [podsWithMetrics]);

  // Calculate total cluster capacity from nodes (fallback if metrics API unavailable)
  const totalClusterCapacity = useMemo(() => {
    // This would ideally come from node metrics, but for now we'll use clusterMetrics if available
    return {
      cpu: clusterMetrics?.totalCpuCapacity ?? null,
      memory: clusterMetrics?.totalMemoryCapacity ?? null,
    };
  }, [clusterMetrics]);

  // Only show skeleton on initial load, not on refetch
  const showSkeleton = (isLoadingCluster || isLoadingStats) && !stats;

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>Welcome to K8s GUI</CardTitle>
            <CardDescription>
              Select a cluster from the header to get started.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (showSkeleton) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <HeaderSkeleton />
        <StatsSkeleton count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Cluster Info Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {currentContext}
          </h1>
          <p className="text-muted-foreground">
            {clusterInfo?.context || "Connected cluster"}
            {currentNamespace && ` • ${currentNamespace}`}
            {!currentNamespace && " • All namespaces"}
          </p>
        </div>
        {isFetching && (
          <Spinner size="sm" className="text-muted-foreground" />
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Pods Card */}
        <Card
          className={cn(
            "transition-all duration-200",
            isFetching && "opacity-70"
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pods</CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pods.total || 0}</div>
            <div className="mt-2 flex gap-2 text-xs">
              <Badge variant="default" className="gap-1">
                <CheckCircle className="h-3 w-3" />
                {stats?.pods.running || 0} Running
              </Badge>
              {(stats?.pods.pending || 0) > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {stats?.pods.pending} Pending
                </Badge>
              )}
              {(stats?.pods.failed || 0) > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {stats?.pods.failed} Failed
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Deployments Card */}
        <Card
          className={cn(
            "transition-all duration-200",
            isFetching && "opacity-70"
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deployments</CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.deployments.total || 0}
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <Badge variant="default" className="gap-1">
                <CheckCircle className="h-3 w-3" />
                {stats?.deployments.available || 0} Available
              </Badge>
              {(stats?.deployments.unavailable || 0) > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {stats?.deployments.unavailable} Unavailable
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Services Card */}
        <Card
          className={cn(
            "transition-all duration-200",
            isFetching && "opacity-70"
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Services</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.services.total || 0}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Active services in namespace
            </p>
          </CardContent>
        </Card>

        {/* Nodes Card */}
        <Card
          className={cn(
            "transition-all duration-200",
            isFetching && "opacity-70"
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nodes</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.nodes.total || 0}</div>
            <div className="mt-2 flex gap-2 text-xs">
              <Badge variant="default" className="gap-1">
                <CheckCircle className="h-3 w-3" />
                {stats?.nodes.ready || 0} Ready
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cluster Resource Usage */}
      {hasAccess ? (
        <div className="grid gap-4 md:grid-cols-2">
          <MetricCard
            title="Cluster CPU Usage"
            used={clusterMetrics?.totalCpuUsage ?? null}
            total={clusterMetrics?.totalCpuCapacity ?? totalClusterCapacity.cpu}
            type="cpu"
            showProgressBar
          />

          <MetricCard
            title="Cluster Memory Usage"
            used={clusterMetrics?.totalMemoryUsage ?? null}
            total={
              clusterMetrics?.totalMemoryCapacity ?? totalClusterCapacity.memory
            }
            type="memory"
            showProgressBar
          />
        </div>
      ) : (
        <LicenseErrorBanner message="Cluster metrics are available for premium users only." />
      )}

      {/* Top Pods by Resource Usage */}
      {hasAccess && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top Pods by CPU</CardTitle>
              <CardDescription>
                Pods consuming the most CPU resources
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topPodsByCPU.length > 0 ? (
                  topPodsByCPU.map((pod, idx) => {
                    const podInfo = podsWithMetrics.find(
                      (p) => p.name === pod.name
                    );
                    return (
                      <Link
                        key={pod.name}
                        to={`/pod/${podInfo?.namespace || "default"}/${pod.name}`}
                        className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            #{idx + 1}
                          </span>
                          <span className="text-sm">{pod.name}</span>
                        </div>
                        <div className="text-sm font-medium">
                          {pod.cpuUsage.toFixed(2)}m
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No pod metrics available
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Pods by Memory</CardTitle>
              <CardDescription>
                Pods consuming the most memory resources
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topPodsByMemory.length > 0 ? (
                  topPodsByMemory.map((pod, idx) => {
                    const podInfo = podsWithMetrics.find(
                      (p) => p.name === pod.name
                    );
                    return (
                      <Link
                        key={pod.name}
                        to={`/pod/${podInfo?.namespace || "default"}/${pod.name}`}
                        className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            #{idx + 1}
                          </span>
                          <span className="text-sm">{pod.name}</span>
                        </div>
                        <div className="text-sm font-medium">
                          {formatBytes(pod.memoryUsage)}
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No pod metrics available
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          <QuickActionButton
            icon={Box}
            label="View Pods"
            href="/workloads/pods"
          />
          <QuickActionButton
            icon={Box}
            label="View Deployments"
            href="/workloads/deployments"
          />
          <QuickActionButton
            icon={Activity}
            label="View Events"
            href="/events"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function QuickActionButton({
  icon: Icon,
  label,
  href,
}: {
  icon: React.ElementType;
  label: string;
  href: string;
}) {
  return (
    <Link
      to={href}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border p-3",
        "transition-colors hover:bg-accent"
      )}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}
