import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Eye, Trash2, RotateCw, Scale, RefreshCw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getStatusColor } from '@/lib/utils';

interface DeploymentInfo {
  name: string;
  namespace: string;
  replicas: number;
  ready_replicas: number;
  available_replicas: number;
  strategy: string;
  conditions: string[];
  age: string;
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
      const ready = row.original.ready_replicas || 0;
      const total = row.original.replicas;
      const isHealthy = ready === total;
      return (
        <span className={isHealthy ? 'text-green-500' : 'text-yellow-500'}>
          {ready}/{total}
        </span>
      );
    },
  },
  {
    accessorKey: 'strategy',
    header: 'Strategy',
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.strategy}</Badge>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const available = row.original.available_replicas || 0;
      const total = row.original.replicas;
      const status = available === total ? 'Available' : 'Progressing';
      return (
        <Badge className={getStatusColor(status)}>
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'age',
    header: 'Age',
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

  const { data: deployments = [], isLoading, refetch } = useQuery({
    queryKey: ['deployments', currentNamespace],
    queryFn: async () => {
      const filters = { namespace: currentNamespace };
      const result = await invoke<DeploymentInfo[]>('list_deployments', { filters });
      return result;
    },
    enabled: isConnected,
  });

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Connect to a cluster to view deployments
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Deployments</h1>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <DataTable columns={columns} data={deployments} isLoading={isLoading} />
    </div>
  );
}
