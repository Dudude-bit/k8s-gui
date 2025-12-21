import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConnectClusterEmptyState } from '@/components/ui/connect-cluster-empty-state';
import { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { Eye, RefreshCw, Shield, ShieldOff, AlertTriangle } from 'lucide-react';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { ActionMenu } from '@/components/ui/action-menu';

interface NodeInfo {
  name: string;
  status: string;
  roles: string[];
  version: string;
  internal_ip: string | null;
  external_ip: string | null;
  os_image: string;
  kernel_version: string;
  container_runtime: string;
  cpu_capacity: string;
  memory_capacity: string;
  pod_count: number;
  age: string;
  is_schedulable: boolean;
}

const getNodeStatusColor = (status: string): 'success' | 'warning' | 'destructive' | 'secondary' => {
  if (status === 'Ready') return 'success';
  if (status === 'NotReady') return 'destructive';
  return 'warning';
};

export function NodeList() {
  const { isConnected } = useClusterStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: nodes = [], isLoading, refetch } = useQuery({
    queryKey: ['nodes'],
    queryFn: async () => {
      const result = await invoke<NodeInfo[]>('list_nodes');
      return result;
    },
    enabled: isConnected,
    staleTime: 10000,
    refetchOnWindowFocus: false,
  });

  const cordonMutation = useMutation({
    mutationFn: async (nodeName: string) => {
      await invoke('cordon_node', { name: nodeName });
    },
    onSuccess: (_, nodeName) => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      toast({
        title: 'Node cordoned',
        description: `Node ${nodeName} has been cordoned.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to cordon node: ${error}`,
        variant: 'destructive',
      });
    },
  });

  const uncordonMutation = useMutation({
    mutationFn: async (nodeName: string) => {
      await invoke('uncordon_node', { name: nodeName });
    },
    onSuccess: (_, nodeName) => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      toast({
        title: 'Node uncordoned',
        description: `Node ${nodeName} has been uncordoned.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to uncordon node: ${error}`,
        variant: 'destructive',
      });
    },
  });

  const drainMutation = useMutation({
    mutationFn: async (nodeName: string) => {
      await invoke('drain_node', { name: nodeName, ignoreDaemonsets: true, deleteEmptydir: true });
    },
    onSuccess: (_, nodeName) => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      toast({
        title: 'Node drained',
        description: `Node ${nodeName} has been drained.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to drain node: ${error}`,
        variant: 'destructive',
      });
    },
  });

  const columns: ColumnDef<NodeInfo>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <Link
          to={`/node/${row.original.name}`}
          className="font-medium hover:underline flex items-center gap-2"
        >
          {row.original.name}
          {!row.original.is_schedulable && (
            <Badge variant="warning" className="text-xs">
              <ShieldOff className="h-3 w-3 mr-1" />
              Cordoned
            </Badge>
          )}
        </Link>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={getNodeStatusColor(row.original.status)}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'roles',
      header: 'Roles',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.roles.map((role) => (
            <Badge key={role} variant="outline" className="text-xs">
              {role}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      accessorKey: 'version',
      header: 'Version',
    },
    {
      accessorKey: 'internal_ip',
      header: 'Internal IP',
      cell: ({ row }) => row.original.internal_ip || '-',
    },
    {
      accessorKey: 'cpu_capacity',
      header: 'CPU',
    },
    {
      accessorKey: 'memory_capacity',
      header: 'Memory',
    },
    {
      accessorKey: 'pod_count',
      header: 'Pods',
    },
    {
      accessorKey: 'age',
      header: 'Age',
    },
    {
    id: 'actions',
    cell: ({ row }) => (
      <ActionMenu>
        <DropdownMenuItem asChild>
          <Link to={`/node/${row.original.name}`}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {row.original.is_schedulable ? (
          <DropdownMenuItem
            onClick={() => cordonMutation.mutate(row.original.name)}
          >
            <ShieldOff className="mr-2 h-4 w-4" />
            Cordon
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() => uncordonMutation.mutate(row.original.name)}
          >
            <Shield className="mr-2 h-4 w-4" />
            Uncordon
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => drainMutation.mutate(row.original.name)}
        >
          <AlertTriangle className="mr-2 h-4 w-4" />
          Drain
        </DropdownMenuItem>
      </ActionMenu>
    ),
  },
];

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="nodes" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Nodes</h1>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <DataTable columns={columns} data={nodes} isLoading={isLoading} />
    </div>
  );
}
