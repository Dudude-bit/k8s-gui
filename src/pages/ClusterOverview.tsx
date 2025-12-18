import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClusterInfo {
  name: string;
  server: string;
  version: string;
}

interface OverviewStats {
  pods: { total: number; running: number; pending: number; failed: number };
  deployments: { total: number; available: number; unavailable: number };
  services: { total: number };
  nodes: { total: number; ready: number };
}

export function ClusterOverview() {
  const { isConnected, currentContext } = useClusterStore();

  const { data: clusterInfo, isLoading: isLoadingCluster } = useQuery({
    queryKey: ['cluster-info', currentContext],
    queryFn: async () => invoke<ClusterInfo>('get_cluster_info'),
    enabled: isConnected,
  });

  // In a real implementation, these would be separate queries
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['overview-stats', currentContext],
    queryFn: async () => {
      // Mock data for now - would aggregate from actual API calls
      return {
        pods: { total: 24, running: 20, pending: 2, failed: 2 },
        deployments: { total: 8, available: 7, unavailable: 1 },
        services: { total: 12 },
        nodes: { total: 3, ready: 3 },
      } as OverviewStats;
    },
    enabled: isConnected,
  });

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

  if (isLoadingCluster || isLoadingStats) {
    return (
      <div className="space-y-6">
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
    <div className="space-y-6">
      {/* Cluster Info Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{currentContext}</h1>
        <p className="text-muted-foreground">
          {clusterInfo?.server || 'Connected cluster'}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Pods Card */}
        <Card>
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
        <Card>
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
        <Card>
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
        <Card>
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
