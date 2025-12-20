import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Trash2, RefreshCw, Copy, FileJson } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';

interface ConfigMapInfo {
  name: string;
  namespace: string;
  uid: string;
  data_keys: string[];
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

export function ConfigMapList() {
  const { isConnected, currentNamespace } = useClusterStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: configMaps = [], isLoading, refetch } = useQuery({
    queryKey: ['configmaps', currentNamespace],
    queryFn: async () => {
      const result = await invoke<ConfigMapInfo[]>('list_configmaps', {
        namespace: currentNamespace,
      });
      return result;
    },
    enabled: isConnected,
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ name, namespace }: { name: string; namespace: string }) => {
      await invoke('delete_configmap', { name, namespace });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configmaps'] });
      toast({
        title: 'ConfigMap deleted',
        description: 'The ConfigMap has been deleted successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to delete ConfigMap: ${error}`,
        variant: 'destructive',
      });
    },
  });

  const handleCopyData = async (name: string, namespace: string) => {
    try {
      const data = await invoke<Record<string, string>>('get_configmap_data', {
        name,
        namespace,
      });
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      toast({
        title: 'Copied',
        description: 'ConfigMap data copied to clipboard.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to copy data: ${error}`,
        variant: 'destructive',
      });
    }
  };

  const handleViewYaml = async (name: string, namespace: string) => {
    try {
      const yaml = await invoke<string>('get_configmap_yaml', { name, namespace });
      console.log(yaml); // TODO: Show in modal or side panel
      toast({
        title: 'YAML Retrieved',
        description: 'Check console for YAML output.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to get YAML: ${error}`,
        variant: 'destructive',
      });
    }
  };

  const columns: ColumnDef<ConfigMapInfo>[] = [
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
      accessorKey: 'data_keys',
      header: 'Keys',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.data_keys.slice(0, 3).map((key, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {key}
            </Badge>
          ))}
          {row.original.data_keys.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{row.original.data_keys.length - 3} more
            </Badge>
          )}
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
            <DropdownMenuItem onClick={() => handleViewYaml(row.original.name, row.original.namespace)}>
              <FileJson className="mr-2 h-4 w-4" />
              View YAML
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleCopyData(row.original.name, row.original.namespace)}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Data
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() =>
                deleteMutation.mutate({
                  name: row.original.name,
                  namespace: row.original.namespace,
                })
              }
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Connect to a cluster to view ConfigMaps
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ConfigMaps</h1>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <DataTable columns={columns} data={configMaps} isLoading={isLoading} />
    </div>
  );
}
