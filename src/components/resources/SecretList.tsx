import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { Trash2, Copy, Lock } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { useMemo, useCallback } from "react";
import { formatAge } from "@/lib/utils";
import { ActionMenu } from "@/components/ui/action-menu";
import { YamlViewerAction } from "@/components/ui/yaml-viewer";
import { YamlEditorMenuAction } from "@/components/ui/yaml-editor";
import { ResourceList } from "./ResourceList";

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
    case "kubernetes.io/tls":
      return "bg-blue-500/20 text-blue-500";
    case "kubernetes.io/dockerconfigjson":
      return "bg-purple-500/20 text-purple-500";
    case "kubernetes.io/service-account-token":
      return "bg-green-500/20 text-green-500";
    default:
      return "bg-gray-500/20 text-gray-500";
  }
};

export function SecretList() {
  const { currentNamespace } = useClusterStore();
  const { toast } = useToast();

  const handleCopyKeys = useCallback(async (secret: SecretInfo) => {
    try {
      await navigator.clipboard.writeText(secret.data_keys.join("\n"));
      toast({
        title: "Copied",
        description: "Secret keys copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to copy keys: ${error}`,
        variant: "destructive",
      });
    }
  }, [toast]);

  const columns = useMemo<ColumnDef<SecretInfo>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
      },
      {
        accessorKey: "namespace",
        header: "Namespace",
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge className={getSecretTypeColor(row.original.type_)}>
            {row.original.type_.replace("kubernetes.io/", "")}
          </Badge>
        ),
      },
      {
        accessorKey: "data_keys",
        header: "Keys",
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
        id: "age",
        header: "Age",
        cell: ({ row }) => formatAge(row.original.created_at),
      },
    ],
    []
  );

  return (
    <ResourceList<SecretInfo>
      title="Secrets"
      queryKey={["secrets", currentNamespace]}
      queryFn={async () => {
        const result = await invoke<SecretInfo[]>("list_secrets", {
          filters: { namespace: currentNamespace },
        });
        return result;
      }}
      columns={(setDeleteTarget) => [
        ...columns,
        {
          id: "actions",
          cell: ({ row }) => (
            <ActionMenu>
              <YamlViewerAction
                title="Secret YAML"
                description={`${row.original.namespace}/${row.original.name}`}
                fetchYaml={() =>
                  invoke<string>("get_secret_yaml", {
                    name: row.original.name,
                    namespace: row.original.namespace,
                  })
                }
              />
              <YamlEditorMenuAction
                title={`Edit Secret: ${row.original.name}`}
                resourceKey={{
                  kind: "Secret",
                  name: row.original.name,
                  namespace: row.original.namespace,
                }}
                fetchYaml={() =>
                  invoke<string>("get_secret_yaml", {
                    name: row.original.name,
                    namespace: row.original.namespace,
                  })
                }
              />
              <DropdownMenuItem onClick={() => handleCopyKeys(row.original)}>
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
      ]}
      emptyStateLabel="Secrets"
      deleteConfig={{
        mutationFn: async (item) => {
          await invoke("delete_secret", {
            name: item.name,
            namespace: item.namespace,
          });
        },
        invalidateQueryKey: ["secrets"],
        successTitle: "Secret deleted",
        successDescription: "The Secret has been deleted successfully.",
        errorPrefix: "Failed to delete Secret",
      }}
      staleTime={10000}
    />
  );
}
