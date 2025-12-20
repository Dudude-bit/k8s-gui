import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Box,
  Server,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClusterInfo {
  name: string;
  server: string;
  version: string;
}

interface PodStats {
  total: number;
  running: number;
  pending: number;
  failed: number;
  succeeded: number;
}

interface DeploymentStats {
  total: number;
  available: number;
  unavailable: number;
  progressing: number;
}

interface ServiceStats {
  total: number;
  cluster_ip: number;
  node_port: number;
  load_balancer: number;
}

interface NodeStats {
  total: number;
  ready: number;
  not_ready: number;
}

interface ClusterStats {
  pods: PodStats;
  deployments: DeploymentStats;
  services: ServiceStats;
  nodes: NodeStats;
}

export function ClusterOverview() {
  const { isConnected, currentContext, currentNamespace } = useClusterStore();

  const { data: clusterInfo, isLoading: isLoadingCluster } = useQuery({
    queryKey: ['cluster-info', currentContext],
    queryFn: async () => invoke<ClusterInfo>('get_cluster_info'),
    enabled: isConnected,
    placeholderData: keepPreviousData,
  });

  // Single efficient stats call with smooth transitions
  const { data: stats, isLoading: isLoadingStats, isFetching } = useQuery({
    queryKey: ['overview-stats', currentContext, currentNamespace],
    queryFn: async () => {
      // Empty string means all namespaces
      const ns = currentNamespace || null;
      return invoke<ClusterStats>('get_cluster_stats', { namespace: ns });
    },
    enabled: isConnected,
    staleTime: 10000, // 10 seconds cache
    placeholderData: keepPreviousData, // Keep showing previous data while loading
  });

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
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Cluster Info Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{currentContext}</h1>
          <p className="text-muted-foreground">
            {clusterInfo?.server || 'Connected cluster'}
            {currentNamespace && ` • ${currentNamespace}`}
            {!currentNamespace && ' • All namespaces'}
          </p>
        </div>
        {isFetching && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Pods Card */}
        <Card className={cn("transition-all duration-200", isFetching && "opacity-70")}>
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
        <Card className={cn("transition-all duration-200", isFetching && "opacity-70")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deployments</CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.deployments.total || 0}</div>
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
        <Card className={cn("transition-all duration-200", isFetching && "opacity-70")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Services</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.services.total || 0}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Active services in namespace
            </p>
          </CardContent>
        </Card>

        {/* Nodes Card */}
        <Card className={cn("transition-all duration-200", isFetching && "opacity-70")}>
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

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          <QuickActionButton icon={Box} label="View Pods" href="/workloads/pods" />
          <QuickActionButton icon={Box} label="View Deployments" href="/workloads/deployments" />
          <QuickActionButton icon={Activity} label="View Events" href="/events" />
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
    <a
      href={href}
      className={cn(
        'flex items-center gap-2 rounded-lg border border-border p-3',
        'transition-colors hover:bg-accent'
      )}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">{label}</span>
    </a>
  );
}
