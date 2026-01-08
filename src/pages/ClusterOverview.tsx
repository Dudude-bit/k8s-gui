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
import { Badge } from "@/components/ui/badge";
import { HeaderSkeleton, StatsSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
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
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { useMetrics } from "@/hooks/useMetrics";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { MetricBadge, MetricCard } from "@/components/ui/metric-card";
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
    staleTime: STALE_TIMES.overview,
    refetchInterval: REFRESH_INTERVALS.overview,
    refetchOnWindowFocus: false,
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
    if (clusterInfo?.serverVersion) {
      parts.push(`Kubernetes ${clusterInfo.serverVersion}`);
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
        isFetching={isFetching}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {resourceStats.map((stat) => (
          <ResourceStatCard key={stat.id} {...stat} dimmed={isFetching} />
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

type StatBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "error";

type StatBadgeConfig = {
  label: string;
  value: number;
  variant?: StatBadgeVariant;
  icon?: React.ElementType;
  hideWhenZero?: boolean;
};

type ResourceStatCardData = {
  id: string;
  title: string;
  icon: React.ElementType;
  value: number;
  badges?: StatBadgeConfig[];
  description?: string;
  href?: string;
};

type TopPodMetric = {
  name: string;
  namespace: string;
  value: number;
};

type OverviewHeaderProps = {
  title: string;
  subtitle: string;
  isFetching: boolean;
};

type ResourceStatCardProps = ResourceStatCardData & {
  dimmed?: boolean;
};

type TopPodsCardProps = {
  title: string;
  description: string;
  items: TopPodMetric[];
  type: "cpu" | "memory";
  basePath: string;
};

type QuickActionTileProps = {
  icon: React.ElementType;
  label: string;
  description: string;
  href?: string;
  onClick?: () => void;
};

function OverviewHeader({ title, subtitle, isFetching }: OverviewHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {isFetching && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner size="sm" className="text-muted-foreground" />
          <span>Updating</span>
        </div>
      )}
    </div>
  );
}

function ResourceStatCard({
  title,
  icon: Icon,
  value,
  badges,
  description,
  dimmed,
  href,
}: ResourceStatCardProps) {
  const visibleBadges =
    badges?.filter((badge) => !badge.hideWhenZero || badge.value > 0) ?? [];

  const card = (
    <Card
      className={cn(
        "transition-all duration-200",
        dimmed && "opacity-70",
        href && "group-hover:bg-accent"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-2xl font-bold">{value}</div>
        {visibleBadges.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {visibleBadges.map((badge) => {
              const BadgeIcon = badge.icon;
              return (
                <Badge
                  key={badge.label}
                  variant={badge.variant ?? "secondary"}
                  className="gap-1"
                >
                  {BadgeIcon && <BadgeIcon className="h-3 w-3" />}
                  {badge.value} {badge.label}
                </Badge>
              );
            })}
          </div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );

  if (!href) {
    return card;
  }

  return (
    <Link
      to={href}
      className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Open ${title}`}
    >
      {card}
    </Link>
  );
}

function TopPodsCard({
  title,
  description,
  items,
  type,
  basePath,
}: TopPodsCardProps) {
  const maxValue = items.reduce((max, item) => Math.max(max, item.value), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item, idx) => {
              const progress = maxValue
                ? Math.min(100, (item.value / maxValue) * 100)
                : 0;
              return (
                <Link
                  key={`${item.namespace}-${item.name}`}
                  to={`${basePath}/${item.namespace}/${item.name}`}
                  className="flex cursor-pointer flex-col gap-2 rounded-md border border-transparent p-2 transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open pod ${item.namespace}/${item.name}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="px-2 text-[10px] font-medium"
                        >
                          #{idx + 1}
                        </Badge>
                        <span className="truncate text-sm font-medium">
                          {item.name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.namespace}
                      </p>
                    </div>
                    <MetricBadge
                      used={item.value}
                      type={type}
                      className="shrink-0"
                    />
                  </div>
                  <Progress value={progress} className="h-1" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No pod metrics available
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActionTile({
  icon: Icon,
  label,
  description,
  href,
  onClick,
}: QuickActionTileProps) {
  const content = (
    <>
      <div className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground transition-colors group-hover:text-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="space-y-1 text-left">
        <p className="text-sm font-medium leading-none">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </>
  );

  const className = cn(
    "group flex items-start gap-3 rounded-lg border border-border bg-card p-3",
    "transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  );

  if (href) {
    return (
      <Link to={href} className={className} aria-label={label}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-label={label}
    >
      {content}
    </button>
  );
}
