import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getStatusColor } from '@/lib/utils';

interface HelmRelease {
  name: string;
  namespace: string;
  revision: string;
  status: string;
  chart: string;
  app_version: string;
  updated: string;
}

const columns: ColumnDef<HelmRelease>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <span className="font-medium">{row.original.name}</span>
    ),
  },
  {
    accessorKey: 'namespace',
    header: 'Namespace',
  },
  {
    accessorKey: 'revision',
    header: 'Revision',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge className={getStatusColor(row.original.status)}>
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: 'chart',
    header: 'Chart',
  },
  {
    accessorKey: 'app_version',
    header: 'App Version',
  },
  {
    accessorKey: 'updated',
    header: 'Updated',
    cell: ({ row }) => {
      const date = new Date(row.original.updated);
      return date.toLocaleString();
    },
  },
  {
    id: 'actions',
    cell: ({ row: _row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>View Values</DropdownMenuItem>
          <DropdownMenuItem>View History</DropdownMenuItem>
          <DropdownMenuItem>Rollback</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Uninstall
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

export function Helm() {
  const { isConnected } = useClusterStore();

  const { data: releases = [], isLoading, refetch } = useQuery({
    queryKey: ['helm-releases'],
    queryFn: async () => {
      const result = await invoke<HelmRelease[]>('list_helm_releases', {
        namespace: null,
        allNamespaces: true,
      });
      return result;
    },
    enabled: isConnected,
  });

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Connect to a cluster to view Helm releases
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Helm Releases</h1>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <DataTable columns={columns} data={releases} isLoading={isLoading} />
    </div>
  );
}
