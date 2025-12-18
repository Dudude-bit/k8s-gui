import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Trash2, RefreshCw, Copy, FileJson, Lock } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';

interface SecretInfo {
  name: string;
  namespace: string;
  secret_type: string;
  data_keys: string[];
  age: string;
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

  const { data: secrets = [], isLoading, refetch } = useQuery({
    queryKey: ['secrets', currentNamespace],
    queryFn: async () => {
      const result = await invoke<SecretInfo[]>('list_secrets', {
        namespace: currentNamespace,
      });
      return result;
    },
    enabled: isConnected,
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
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to delete Secret: ${error}`,
        variant: 'destructive',
      });
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

  const handleViewYaml = async (name: string, namespace: string) => {
    try {
      const yaml = await invoke<string>('get_secret_yaml', { name, namespace });
      console.log(yaml); // TODO: Show in modal or side panel
      toast({
        title: 'YAML Retrieved',
        description: 'Check console for YAML output (values are base64 encoded).',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to get YAML: ${error}`,
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
      accessorKey: 'secret_type',
      header: 'Type',
      cell: ({ row }) => (
        <Badge className={getSecretTypeColor(row.original.secret_type)}>
          {row.original.secret_type.replace('kubernetes.io/', '')}
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
            <DropdownMenuItem onClick={() => handleViewYaml(row.original.name, row.original.namespace)}>
              <FileJson className="mr-2 h-4 w-4" />
              View YAML
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleCopyKeys(row.original.name, row.original.namespace)}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Keys
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
        Connect to a cluster to view Secrets
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Secrets</h1>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <DataTable columns={columns} data={secrets} isLoading={isLoading} />
    </div>
  );
}
