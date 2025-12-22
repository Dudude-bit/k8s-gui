import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { Trash2, Copy, Lock } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useMemo, useCallback } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { YamlViewerAction } from "@/components/ui/yaml-viewer";
import { YamlEditorMenuAction } from "@/components/ui/yaml-editor";
import { ResourceList } from "./ResourceList";
import { useCopyToClipboard } from "@/hooks";
import {
  createNamespaceColumn,
  createAgeColumn,
  createDataKeysColumn,
} from "./columns";

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
  const copyToClipboard = useCopyToClipboard();

  const handleCopyKeys = useCallback(async (secret: SecretInfo) => {
    copyToClipboard(secret.data_keys.join("\n"), "Secret keys copied to clipboard.");
  }, [copyToClipboard]);

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
      createNamespaceColumn<SecretInfo>(),
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge className={getSecretTypeColor(row.original.type_)}>
            {row.original.type_.replace("kubernetes.io/", "")}
          </Badge>
        ),
      },
      createDataKeysColumn<SecretInfo>(),
      createAgeColumn<SecretInfo>(),
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
        invalidateQueryKeys: [["secrets"]],
        resourceType: "Secret",
      }}
      staleTime={10000}
    />
  );
}
