import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ConnectClusterEmptyState } from '@/components/ui/connect-cluster-empty-state';
import { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { Eye, Trash2, Terminal, FileText, RefreshCw, Loader2 } from 'lucide-react';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { formatAge, getStatusColor } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { ActionMenu } from '@/components/ui/action-menu';

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

// Helper to format ready containers count
function formatReady(containers: ContainerInfo[]): string {
  const ready = containers.filter(c => c.ready).length;
  return `${ready}/${containers.length}`;
}

export function PodList() {
  const { isConnected, currentNamespace } = useClusterStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<PodInfo | null>(null);

  const { data: pods = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['pods', currentNamespace],
    queryFn: async () => {
      const result = await invoke<PodInfo[]>('list_pods', {
        filters: { namespace: currentNamespace },
      });
      return result;
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ name, namespace }: { name: string; namespace: string }) => {
      await invoke('delete_pod', { name, namespace });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pods'] });
      toast({
        title: 'Pod deleted',
        description: 'The pod has been deleted successfully.',
      });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to delete pod: ${error}`,
        variant: 'destructive',
      });
      setDeleteTarget(null);
    },
  });

  const columns = useMemo<ColumnDef<PodInfo>[]>(() => [
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
        <ActionMenu>
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
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => setDeleteTarget(row.original)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </ActionMenu>
      ),
    },
  ], [setDeleteTarget]);

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="pods" />;
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
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title="Delete pod?"
        description={
          deleteTarget
            ? `This will delete ${deleteTarget.name} in ${deleteTarget.namespace}.`
            : undefined
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        confirmDisabled={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate({
              name: deleteTarget.name,
              namespace: deleteTarget.namespace,
            });
          }
        }}
      />
    </div>
  );
}
