import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { commands } from "@/lib/commands";
import { useClusterStore } from "@/stores/clusterStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HeaderSkeleton, StatsSkeleton } from "@/components/ui/skeleton";
import {
  Box,
  Server,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  Layers,
  Package,
} from "lucide-react";
import { useMetrics, usePremiumFeature, useClusterInfo } from "@/hooks";
import { MetricCard } from "@/components/ui/metric-card";
import { LicenseErrorBanner } from "@/components/license/LicenseErrorBanner";
import { MetricsStatusBanner } from "@/components/metrics";
import {
  getTopPodsByCPU,
  getTopPodsByMemory,
  mergePodsWithMetrics,
} from "@/lib/metrics";
import { useMemo } from "react";
import { normalizeTauriError } from "@/lib/error-utils";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { REFRESH_INTERVALS, STALE_TIMES } from "@/lib/refresh";
import {
  OverviewHeader,
  ResourceStatCard,
  TopPodsCard,
  QuickActionTile,
  type ResourceStatCardData,
  type TopPodMetric,
  type QuickActionTileProps,
} from "@/components/overview";

export function ClusterOverview() {
  const { isConnected, currentContext, currentNamespace } = useClusterStore();

  const { data: clusterInfo, isLoading: isLoadingCluster } = useClusterInfo();

  // Single efficient stats call with smooth transitions
  const {
    data: stats,
    isLoading: isLoadingStats,
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
    staleTime: STALE_TIMES.overview,
    placeholderData: keepPreviousData, // Keep showing previous data while loading
    refetchInterval: REFRESH_INTERVALS.overview,
    refetchOnWindowFocus: false,
  });

  // Check premium feature access
  const { hasAccess } = usePremiumFeature();

  const { clusterMetrics, clusterStatus, podMetrics: allPodMetrics, podStatus } =
    useMetrics({
      namespace: null,
      includeNodes: false,
      enabled: isConnected,
    });

  // Get all pods
  const { data: allPods = [] } = useQuery({
    queryKey: [toPlural(ResourceType.Pod), undefined],
    queryFn: async () => {
      try {
        const result = await commands.listPods({
          namespace: null,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
          statusFilter: null,
          selector: null,
          nodeName: null,
        });
        return result;
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIMES.resourceList,
    refetchInterval: REFRESH_INTERVALS.resourceList,
    refetchOnWindowFocus: false,
  });

  // Merge pods with metrics
  const podsWithMetrics = useMemo(() => {
    return mergePodsWithMetrics(allPods, allPodMetrics);
  }, [allPods, allPodMetrics]);

  // Calculate top pods by CPU and Memory
  const topPodsByCPU = useMemo<TopPodMetric[]>(() => {
    return getTopPodsByCPU(podsWithMetrics, 5).map((pod) => ({
      name: pod.name,
      namespace: pod.namespace,
      value: pod.cpuMillicores,
    }));
  }, [podsWithMetrics]);

  const topPodsByMemory = useMemo<TopPodMetric[]>(() => {
    return getTopPodsByMemory(podsWithMetrics, 5).map((pod) => ({
      name: pod.name,
      namespace: pod.namespace,
      value: pod.memoryBytes,
    }));
  }, [podsWithMetrics]);

  // Calculate total cluster capacity from nodes (fallback if metrics API unavailable)
  const totalClusterCapacity = useMemo(() => {
    // This would ideally come from node metrics, but for now we'll use clusterMetrics if available
    return {
      cpu: clusterMetrics?.totalCpuCapacityMillicores ?? null,
      memory: clusterMetrics?.totalMemoryCapacityBytes ?? null,
    };
  }, [clusterMetrics]);

  const metricsStatus =
    clusterStatus?.status !== "available"
      ? clusterStatus
      : podStatus?.status !== "available"
        ? podStatus
        : null;

  const overviewSubtitle = useMemo(() => {
    const parts = [clusterInfo?.context || "Connected cluster"];
    parts.push(
      currentNamespace ? `Namespace: ${currentNamespace}` : "All namespaces"
    );
    if (clusterInfo?.server_version) {
      parts.push(`Kubernetes ${clusterInfo.server_version}`);
    }
    if (clusterInfo?.platform) {
      parts.push(clusterInfo.platform);
    }
    return parts.join(" • ");
  }, [clusterInfo, currentNamespace]);

  const resourceStats = useMemo<ResourceStatCardData[]>(() => {
    return [
      {
        id: "pods",
        title: "Pods",
        icon: Box,
        value: stats?.pods.total ?? 0,
        href: `/workloads/${toPlural(ResourceType.Pod)}`,
        badges: [
          {
            label: "Running",
            value: stats?.pods.running ?? 0,
            variant: "success",
            icon: CheckCircle,
          },
          {
            label: "Pending",
            value: stats?.pods.pending ?? 0,
            variant: "warning",
            icon: Clock,
            hideWhenZero: true,
          },
          {
            label: "Failed",
            value: stats?.pods.failed ?? 0,
            variant: "error",
            icon: AlertTriangle,
            hideWhenZero: true,
          },
        ],
      },
      {
        id: "deployments",
        title: "Deployments",
        icon: Box,
        value: stats?.deployments.total ?? 0,
        href: `/workloads/${toPlural(ResourceType.Deployment)}`,
        badges: [
          {
            label: "Available",
            value: stats?.deployments.available ?? 0,
            variant: "success",
            icon: CheckCircle,
          },
          {
            label: "Unavailable",
            value: stats?.deployments.unavailable ?? 0,
            variant: "error",
            icon: AlertTriangle,
            hideWhenZero: true,
          },
        ],
      },
      {
        id: "services",
        title: "Services",
        icon: Activity,
        value: stats?.services.total ?? 0,
        description: "Active services in namespace",
        href: `/network/${toPlural(ResourceType.Service)}`,
      },
      {
        id: "nodes",
        title: "Nodes",
        icon: Server,
        value: stats?.nodes.total ?? 0,
        href: `/${toPlural(ResourceType.Node)}`,
        badges: [
          {
            label: "Ready",
            value: stats?.nodes.ready ?? 0,
            variant: "success",
            icon: CheckCircle,
          },
        ],
      },
    ];
  }, [stats]);

  const podBasePath = `/${toPlural(ResourceType.Pod)}`;

  const openCommandPalette = () => {
    window.dispatchEvent(new CustomEvent("command-palette-open"));
  };

  const quickActions: QuickActionTileProps[] = [
    {
      icon: Search,
      label: "Command Palette",
      description: "Search resources and run commands",
      onClick: openCommandPalette,
    },
    {
      icon: Layers,
      label: "Infrastructure Builder",
      description: "Design manifests visually",
      href: "/configuration/builder",
    },
    {
      icon: Package,
      label: "Helm Releases",
      description: "Install and manage charts",
      href: "/helm",
    },
  ];

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
      <OverviewHeader
        title={currentContext || "Cluster Overview"}
        subtitle={overviewSubtitle}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {resourceStats.map((stat) => (
          <ResourceStatCard key={stat.id} {...stat} />
        ))}
      </div>

      {/* Cluster Resource Usage */}
      {hasAccess && metricsStatus && (
        <MetricsStatusBanner status={metricsStatus} />
      )}
      {hasAccess ? (
        <div className="grid gap-4 md:grid-cols-2">
          <MetricCard
            title="Cluster CPU Usage"
            used={clusterMetrics?.totalCpuMillicores ?? null}
            total={
              clusterMetrics?.totalCpuCapacityMillicores ??
              totalClusterCapacity.cpu
            }
            type="cpu"
            showProgressBar
          />

          <MetricCard
            title="Cluster Memory Usage"
            used={clusterMetrics?.totalMemoryBytes ?? null}
            total={
              clusterMetrics?.totalMemoryCapacityBytes ??
              totalClusterCapacity.memory
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
          <TopPodsCard
            title="Top Pods by CPU"
            description="Pods consuming the most CPU resources"
            items={topPodsByCPU}
            type="cpu"
            basePath={podBasePath}
          />
          <TopPodsCard
            title="Top Pods by Memory"
            description="Pods consuming the most memory resources"
            items={topPodsByMemory}
            type="memory"
            basePath={podBasePath}
          />
        </div>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {quickActions.map((action) => (
            <QuickActionTile key={action.label} {...action} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
