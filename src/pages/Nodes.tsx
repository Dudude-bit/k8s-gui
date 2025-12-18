import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Eye } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getStatusColor } from '@/lib/utils';

interface NodeInfo {
  name: string;
  status: string;
  roles: string[];
  version: string;
  internal_ip: string;
  external_ip: string | null;
  os_image: string;
  kernel_version: string;
  container_runtime: string;
  cpu_capacity: string;
  memory_capacity: string;
  age: string;
}

const columns: ColumnDef<NodeInfo>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <Link
        to={`/nodes/${row.original.name}`}
        className="font-medium hover:underline"
      >
        {row.original.name}
      </Link>
    ),
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
    accessorKey: 'roles',
    header: 'Roles',
    cell: ({ row }) => (
      <div className="flex gap-1">
        {row.original.roles.map((role) => (
          <Badge key={role} variant="outline">
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
            <Link to={`/nodes/${row.original.name}`}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

export function Nodes() {
  const { isConnected } = useClusterStore();

  const { data: nodes = [], isLoading } = useQuery({
    queryKey: ['nodes'],
    queryFn: async () => {
      const result = await invoke<NodeInfo[]>('list_nodes', { filters: null });
      return result;
    },
    enabled: isConnected,
  });

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Connect to a cluster to view nodes
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Nodes</h1>
      </div>
      <DataTable columns={columns} data={nodes} isLoading={isLoading} />
    </div>
  );
}
