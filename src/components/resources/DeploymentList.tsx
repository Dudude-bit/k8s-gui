import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Eye, Trash2, RotateCw, Scale, RefreshCw, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getStatusColor } from '@/lib/utils';

interface ConditionInfo {
  type_: string;
  status: string;
  reason: string | null;
  message: string | null;
  last_transition_time: string | null;
}

interface ReplicaInfo {
  desired: number;
  ready: number;
  available: number;
  updated: number;
}

interface DeploymentInfo {
  name: string;
  namespace: string;
  uid: string;
  replicas: ReplicaInfo;
  strategy: string | null;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  created_at: string | null;
  conditions: ConditionInfo[];
}

// Helper to calculate age from timestamp
function formatAge(createdAt: string | null): string {
  if (!createdAt) return 'Unknown';
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return `${diffSecs}s`;
}

const columns: ColumnDef<DeploymentInfo>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <Link
        to={`/deployment/${row.original.namespace}/${row.original.name}`}
        className="font-medium hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: 'namespace',
    header: 'Namespace',
  },
  {
    id: 'replicas',
    header: 'Replicas',
    cell: ({ row }) => {
      const ready = row.original.replicas.ready || 0;
      const total = row.original.replicas.desired;
      const isHealthy = ready === total;
      return (
        <span className={isHealthy ? 'text-green-500' : 'text-yellow-500'}>
          {ready}/{total}
        </span>
      );
    },
  },
  {
    id: 'strategy',
    header: 'Strategy',
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.strategy || 'RollingUpdate'}</Badge>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const available = row.original.replicas.available || 0;
      const total = row.original.replicas.desired;
      const status = available === total ? 'Available' : 'Progressing';
      return (
        <Badge className={getStatusColor(status)}>
          {status}
        </Badge>
      );
    },
  },
  {
    id: 'age',
    header: 'Age',
    cell: ({ row }) => formatAge(row.original.created_at),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to={`/deployment/${row.original.namespace}/${row.original.name}`}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Scale className="mr-2 h-4 w-4" />
            Scale
          </DropdownMenuItem>
          <DropdownMenuItem>
            <RotateCw className="mr-2 h-4 w-4" />
            Restart
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

export function DeploymentList() {
  const { isConnected, currentNamespace } = useClusterStore();

  const { data: deployments = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['deployments', currentNamespace],
    queryFn: async () => {
      const ns = currentNamespace || null;
      const result = await invoke<DeploymentInfo[]>('list_deployments', { namespace: ns });
      return result;
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 5000,
  });

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Connect to a cluster to view deployments
      </div>
    );
  }

  const showSkeleton = isLoading && deployments.length === 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Deployments</h1>
          {isFetching && !isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button 
          variant="outline" 
          size="icon" 
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <DataTable 
        columns={columns} 
        data={deployments} 
        isLoading={showSkeleton}
        isFetching={isFetching && !isLoading}
      />
    </div>
  );
}
