import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Eye, Trash2, Terminal, FileText, RefreshCw, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getStatusColor } from '@/lib/utils';

interface ContainerState {
  type: 'running' | 'waiting' | 'terminated' | 'unknown';
  reason?: string | null;
  exit_code?: number;
}

interface ContainerInfo {
  name: string;
  image: string;
  ready: boolean;
  state: ContainerState;
  restart_count: number;
}

interface PodStatusInfo {
  phase: string;
  ready: boolean;
  message: string | null;
  reason: string | null;
}

interface PodInfo {
  name: string;
  namespace: string;
  uid: string;
  status: PodStatusInfo;
  node_name: string | null;
  pod_ip: string | null;
  host_ip: string | null;
  containers: ContainerInfo[];
  labels: Record<string, string>;
  annotations: Record<string, string>;
  created_at: string | null;
  restart_count: number;
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

// Helper to format ready containers count
function formatReady(containers: ContainerInfo[]): string {
  const ready = containers.filter(c => c.ready).length;
  return `${ready}/${containers.length}`;
}

const columns: ColumnDef<PodInfo>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <Link
        to={`/pod/${row.original.namespace}/${row.original.name}`}
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
    id: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge className={getStatusColor(row.original.status.phase)}>
        {row.original.status.phase}
      </Badge>
    ),
  },
  {
    id: 'ready',
    header: 'Ready',
    cell: ({ row }) => formatReady(row.original.containers),
  },
  {
    id: 'restarts',
    header: 'Restarts',
    cell: ({ row }) => (
      <span className={row.original.restart_count > 5 ? 'text-yellow-500' : ''}>
        {row.original.restart_count}
      </span>
    ),
  },
  {
    id: 'node',
    header: 'Node',
    cell: ({ row }) => row.original.node_name || '-',
  },
  {
    id: 'ip',
    header: 'IP',
    cell: ({ row }) => row.original.pod_ip || '-',
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
            <Link to={`/pod/${row.original.namespace}/${row.original.name}`}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <FileText className="mr-2 h-4 w-4" />
            View Logs
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Terminal className="mr-2 h-4 w-4" />
            Shell
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

export function PodList() {
  const { isConnected, currentNamespace } = useClusterStore();

  const { data: pods = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['pods', currentNamespace],
    queryFn: async () => {
      const ns = currentNamespace || null;
      const result = await invoke<PodInfo[]>('list_pods', { namespace: ns });
      return result;
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 5000,
  });

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Connect to a cluster to view pods
      </div>
    );
  }

  // Only show loading skeleton on initial load
  const showSkeleton = isLoading && pods.length === 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Pods</h1>
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
        data={pods} 
        isLoading={showSkeleton}
        isFetching={isFetching && !isLoading}
      />
    </div>
  );
}
