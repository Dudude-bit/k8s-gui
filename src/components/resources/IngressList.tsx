import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Eye, Trash2, RefreshCw, Globe, ExternalLink } from 'lucide-react';
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

interface IngressRule {
  host: string;
  paths: {
    path: string;
    path_type: string;
    backend_service: string;
    backend_port: number | string;
  }[];
}

interface IngressInfo {
  name: string;
  namespace: string;
  class_name: string | null;
  rules: IngressRule[];
  load_balancer_ips: string[];
  tls_hosts: string[];
  age: string;
}

const columns: ColumnDef<IngressInfo>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{row.original.name}</span>
      </div>
    ),
  },
  {
    accessorKey: 'namespace',
    header: 'Namespace',
  },
  {
    accessorKey: 'class_name',
    header: 'Class',
    cell: ({ row }) => row.original.class_name || 'default',
  },
  {
    accessorKey: 'rules',
    header: 'Hosts',
    cell: ({ row }) => {
      const hosts = row.original.rules.map((r) => r.host).filter(Boolean);
      if (hosts.length === 0) return '*';
      return (
        <div className="flex flex-wrap gap-1">
          {hosts.slice(0, 2).map((host, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {host}
            </Badge>
          ))}
          {hosts.length > 2 && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="secondary" className="text-xs">
                  +{hosts.length - 2}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {hosts.slice(2).map((host, i) => (
                  <div key={i}>{host}</div>
                ))}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      );
    },
  },
  {
    id: 'paths',
    header: 'Paths',
    cell: ({ row }) => {
      const allPaths = row.original.rules.flatMap((r) => r.paths);
      if (allPaths.length === 0) return '-';
      return (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="secondary">{allPaths.length} path(s)</Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1 text-xs">
              {allPaths.map((p, i) => (
                <div key={i}>
                  {p.path} → {p.backend_service}:{p.backend_port}
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    accessorKey: 'load_balancer_ips',
    header: 'Address',
    cell: ({ row }) => {
      const ips = row.original.load_balancer_ips;
      if (ips.length === 0) return <span className="text-muted-foreground">Pending</span>;
      return (
        <div className="flex items-center gap-1">
          <span className="text-xs">{ips[0]}</span>
          {ips.length > 1 && (
            <Badge variant="secondary" className="text-xs">
              +{ips.length - 1}
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'tls_hosts',
    header: 'TLS',
    cell: ({ row }) => {
      const tlsHosts = row.original.tls_hosts;
      if (tlsHosts.length === 0) {
        return <Badge variant="outline">No TLS</Badge>;
      }
      return (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="default" className="bg-green-500/10 text-green-500 border-green-500/20">
              TLS ({tlsHosts.length})
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              {tlsHosts.map((host, i) => (
                <div key={i} className="text-xs">{host}</div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
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
          <DropdownMenuItem>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
          {row.original.load_balancer_ips.length > 0 && row.original.rules[0]?.host && (
            <DropdownMenuItem
              onClick={() => window.open(`https://${row.original.rules[0].host}`, '_blank')}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in Browser
            </DropdownMenuItem>
          )}
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

export function IngressList() {
  const { isConnected, currentNamespace } = useClusterStore();

  const { data: ingresses = [], isLoading, refetch } = useQuery({
    queryKey: ['ingresses', currentNamespace],
    queryFn: async () => {
      const result = await invoke<IngressInfo[]>('list_ingresses', {
        namespace: currentNamespace === 'all' ? null : currentNamespace,
      });
      return result;
    },
    enabled: isConnected,
  });

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Connect to a cluster to view ingresses
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ingresses</h1>
          <p className="text-sm text-muted-foreground">
            HTTP/HTTPS routing rules for external access to services
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <DataTable columns={columns} data={ingresses} isLoading={isLoading} searchKey="name" />
    </div>
  );
}
