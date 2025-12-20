import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Eye, Trash2, RefreshCw, Database } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PersistentVolumeClaimInfo {
  name: string;
  namespace: string;
  status: string;
  volume: string | null;
  capacity: string;
  access_modes: string[];
  storage_class: string;
  age: string;
}

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'bound':
      return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'pending':
      return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    case 'lost':
      return 'bg-red-500/10 text-red-500 border-red-500/20';
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  }
};

const columns: ColumnDef<PersistentVolumeClaimInfo>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{row.original.name}</span>
      </div>
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
    accessorKey: 'volume',
    header: 'Volume',
    cell: ({ row }) => row.original.volume || '-',
  },
  {
    accessorKey: 'capacity',
    header: 'Capacity',
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.capacity || 'N/A'}</Badge>
    ),
  },
  {
    accessorKey: 'access_modes',
    header: 'Access Modes',
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.access_modes.map((mode, i) => (
          <Tooltip key={i}>
            <TooltipTrigger>
              <Badge variant="secondary" className="text-xs">
                {mode}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {mode === 'RWO' && 'ReadWriteOnce'}
              {mode === 'ROX' && 'ReadOnlyMany'}
              {mode === 'RWX' && 'ReadWriteMany'}
              {mode === 'RWOP' && 'ReadWriteOncePod'}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    ),
  },
  {
    accessorKey: 'storage_class',
    header: 'Storage Class',
    cell: ({ row }) => row.original.storage_class || 'default',
  },
  {
    accessorKey: 'age',
    header: 'Age',
  },
  {
    id: 'actions',
    cell: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>
            <Eye className="mr-2 h-4 w-4" />
            View Details
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

export function PersistentVolumeClaimList() {
  const { isConnected, currentNamespace } = useClusterStore();

  const { data: pvcs = [], isLoading, refetch } = useQuery({
    queryKey: ['persistent-volume-claims', currentNamespace],
    queryFn: async () => {
      const result = await invoke<PersistentVolumeClaimInfo[]>('list_persistent_volume_claims', {
        namespace: currentNamespace === 'all' ? null : currentNamespace,
      });
      return result;
    },
    enabled: isConnected,
  });

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Connect to a cluster to view persistent volume claims
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Persistent Volume Claims</h1>
          <p className="text-sm text-muted-foreground">
            Requests for storage by pods in namespace {currentNamespace}
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <DataTable columns={columns} data={pvcs} isLoading={isLoading} searchKey="name" />
    </div>
  );
}
