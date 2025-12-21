import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ConnectClusterEmptyState } from '@/components/ui/connect-cluster-empty-state';
import { ColumnDef } from '@tanstack/react-table';
import { Trash2, RefreshCw, Copy, Lock, Loader2 } from 'lucide-react';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { useState } from 'react';
import { formatAge } from '@/lib/utils';
import { ActionMenu } from '@/components/ui/action-menu';
import { YamlViewerAction } from '@/components/ui/yaml-viewer';

interface SecretInfo {
  name: string;
  namespace: string;
  uid: string;
  type_: string;
  data_keys: string[];
  labels: Record<string, string>;
  created_at: string | null;
}

const getSecretTypeColor = (type: string): string => {
  switch (type) {
    case 'kubernetes.io/tls':
      return 'bg-blue-500/20 text-blue-500';
    case 'kubernetes.io/dockerconfigjson':
      return 'bg-purple-500/20 text-purple-500';
    case 'kubernetes.io/service-account-token':
      return 'bg-green-500/20 text-green-500';
    default:
      return 'bg-gray-500/20 text-gray-500';
  }
};

export function SecretList() {
  const { isConnected, currentNamespace } = useClusterStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<SecretInfo | null>(null);

  const { data: secrets = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['secrets', currentNamespace],
    queryFn: async () => {
      const result = await invoke<SecretInfo[]>('list_secrets', {
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
      await invoke('delete_secret', { name, namespace });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['secrets'] });
      toast({
        title: 'Secret deleted',
        description: 'The Secret has been deleted successfully.',
      });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to delete Secret: ${error}`,
        variant: 'destructive',
      });
      setDeleteTarget(null);
    },
  });

  const handleCopyKeys = async (name: string, namespace: string) => {
    try {
      const keys = secrets.find(s => s.name === name && s.namespace === namespace)?.data_keys || [];
      await navigator.clipboard.writeText(keys.join('\n'));
      toast({
        title: 'Copied',
        description: 'Secret keys copied to clipboard.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to copy keys: ${error}`,
        variant: 'destructive',
      });
    }
  };

  const columns: ColumnDef<SecretInfo>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{row.original.name}</span>
        </div>
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
        <Badge className={getSecretTypeColor(row.original.type_)}>
          {row.original.type_.replace('kubernetes.io/', '')}
        </Badge>
      ),
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
            title="Secret YAML"
            description={`${row.original.namespace}/${row.original.name}`}
            fetchYaml={() =>
              invoke<string>('get_secret_yaml', {
                name: row.original.name,
                namespace: row.original.namespace,
              })
            }
          />
          <DropdownMenuItem onClick={() => handleCopyKeys(row.original.name, row.original.namespace)}>
            <Copy className="mr-2 h-4 w-4" />
            Copy Keys
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
    return <ConnectClusterEmptyState resourceLabel="Secrets" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Secrets</h1>
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
        data={secrets}
        isLoading={isLoading && secrets.length === 0}
        isFetching={isFetching && !isLoading}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title="Delete secret?"
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
