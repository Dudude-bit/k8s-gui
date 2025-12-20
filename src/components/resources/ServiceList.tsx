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

interface ServicePortInfo {
  name: string | null;
  port: number;
  target_port: string;
  node_port: number | null;
  protocol: string;
}

interface ServiceInfo {
  name: string;
  namespace: string;
  uid: string;
  type_: string;
  cluster_ip: string | null;
  external_ips: string[];
  ports: ServicePortInfo[];
  selector: Record<string, string>;
  labels: Record<string, string>;
  created_at: string | null;
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

// Format port for display
function formatPort(port: ServicePortInfo): string {
  let result = `${port.port}`;
  if (port.target_port && port.target_port !== String(port.port)) {
    result += `:${port.target_port}`;
  }
  if (port.node_port) {
    result += `:${port.node_port}`;
  }
  result += `/${port.protocol}`;
  return result;
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
    id: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.type_}</Badge>
    ),
  },
  {
    id: 'cluster_ip',
    header: 'Cluster IP',
    cell: ({ row }) => row.original.cluster_ip || '-',
  },
  {
    id: 'external_ip',
    header: 'External IP',
    cell: ({ row }) => row.original.external_ips.length > 0 ? row.original.external_ips.join(', ') : '-',
  },
  {
    id: 'ports',
    header: 'Ports',
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.ports.map((port, i) => (
          <Badge key={i} variant="secondary" className="text-xs">
            {formatPort(port)}
          </Badge>
        ))}
      </div>
    ),
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
