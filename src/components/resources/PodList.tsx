import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Eye, Trash2, Terminal, FileText, RefreshCw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getStatusColor } from '@/lib/utils';

interface PodInfo {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
  node: string;
  ip: string | null;
  age: string;
  containers: string[];
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
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge className={getStatusColor(row.original.status)}>
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: 'ready',
    header: 'Ready',
  },
  {
    accessorKey: 'restarts',
    header: 'Restarts',
    cell: ({ row }) => (
      <span className={row.original.restarts > 5 ? 'text-yellow-500' : ''}>
        {row.original.restarts}
      </span>
    ),
  },
  {
    accessorKey: 'node',
    header: 'Node',
  },
  {
    accessorKey: 'ip',
    header: 'IP',
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

  const { data: pods = [], isLoading, refetch } = useQuery({
    queryKey: ['pods', currentNamespace],
    queryFn: async () => {
      const filters = { namespace: currentNamespace };
      const result = await invoke<PodInfo[]>('list_pods', { filters });
      return result;
    },
    enabled: isConnected,
  });

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Connect to a cluster to view pods
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pods</h1>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <DataTable columns={columns} data={pods} isLoading={isLoading} />
    </div>
  );
}
