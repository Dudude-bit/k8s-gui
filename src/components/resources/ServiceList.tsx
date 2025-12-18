import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Eye, Trash2, RefreshCw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ServiceInfo {
  name: string;
  namespace: string;
  service_type: string;
  cluster_ip: string;
  external_ip: string | null;
  ports: string[];
  selector: Record<string, string>;
  age: string;
}

const columns: ColumnDef<ServiceInfo>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <Link
        to={`/service/${row.original.namespace}/${row.original.name}`}
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
    accessorKey: 'service_type',
    header: 'Type',
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.service_type}</Badge>
    ),
  },
  {
    accessorKey: 'cluster_ip',
    header: 'Cluster IP',
  },
  {
    accessorKey: 'external_ip',
    header: 'External IP',
    cell: ({ row }) => row.original.external_ip || '-',
  },
  {
    accessorKey: 'ports',
    header: 'Ports',
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.ports.map((port, i) => (
          <Badge key={i} variant="secondary" className="text-xs">
            {port}
          </Badge>
        ))}
      </div>
    ),
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
            <Link to={`/service/${row.original.namespace}/${row.original.name}`}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </Link>
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

export function ServiceList() {
  const { isConnected, currentNamespace } = useClusterStore();

  const { data: services = [], isLoading, refetch } = useQuery({
    queryKey: ['services', currentNamespace],
    queryFn: async () => {
      const filters = { namespace: currentNamespace };
      const result = await invoke<ServiceInfo[]>('list_services', { filters });
      return result;
    },
    enabled: isConnected,
  });

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Connect to a cluster to view services
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Services</h1>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <DataTable columns={columns} data={services} isLoading={isLoading} />
    </div>
  );
}
