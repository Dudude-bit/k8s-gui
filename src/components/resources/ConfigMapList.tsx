import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ConnectClusterEmptyState } from '@/components/ui/connect-cluster-empty-state';
import { ColumnDef } from '@tanstack/react-table';
import { Trash2, RefreshCw, Copy, Loader2 } from 'lucide-react';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { useState } from 'react';
import { formatAge } from '@/lib/utils';
import { ActionMenu } from '@/components/ui/action-menu';
import { YamlViewerAction } from '@/components/ui/yaml-viewer';

interface ConfigMapInfo {
  name: string;
  namespace: string;
  uid: string;
  data_keys: string[];
  labels: Record<string, string>;
  created_at: string | null;
}

export function ConfigMapList() {
  const { isConnected, currentNamespace } = useClusterStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<ConfigMapInfo | null>(null);

  const { data: configMaps = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['configmaps', currentNamespace],
    queryFn: async () => {
      const result = await invoke<ConfigMapInfo[]>('list_configmaps', {
        filters: { namespace: currentNamespace },
      });
      return result;
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 10000,
    refetchOnWindowFocus: false,
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
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to delete ConfigMap: ${error}`,
        variant: 'destructive',
      });
      setDeleteTarget(null);
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
        <ActionMenu>
          <YamlViewerAction
            title="ConfigMap YAML"
            description={`${row.original.namespace}/${row.original.name}`}
            fetchYaml={() =>
              invoke<string>('get_configmap_yaml', {
                name: row.original.name,
                namespace: row.original.namespace,
              })
            }
          />
          <DropdownMenuItem onClick={() => handleCopyData(row.original.name, row.original.namespace)}>
            <Copy className="mr-2 h-4 w-4" />
            Copy Data
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => setDeleteTarget(row.original)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </ActionMenu>
      ),
    },
  ];

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="ConfigMaps" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">ConfigMaps</h1>
          {isFetching && !isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={configMaps}
        isLoading={isLoading && configMaps.length === 0}
        isFetching={isFetching && !isLoading}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title="Delete ConfigMap?"
        description={
          deleteTarget
            ? `This will delete ${deleteTarget.name} in ${deleteTarget.namespace}.`
            : undefined
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        confirmDisabled={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate({
              name: deleteTarget.name,
              namespace: deleteTarget.namespace,
            });
          }
        }}
      />
    </div>
  );
}
