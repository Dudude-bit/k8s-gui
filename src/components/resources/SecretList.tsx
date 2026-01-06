import * as commands from "@/generated/commands";
import { fetchResourceYaml } from "@/hooks/useResourceYaml";
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
import type { SecretInfo } from "@/generated/types";
import { ResourceList } from "./ResourceList";
import { ResourceType, toPlural } from "@/lib/resource-types";
import { useCopyToClipboard } from "@/hooks";
import {
  createNamespaceColumn,
  createAgeColumn,
  createDataKeysColumn,
} from "./columns";

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

  const handleCopyKeys = useCallback(
    async (secret: SecretInfo) => {
      copyToClipboard(
        secret.dataKeys.join("\n"),
        "Secret keys copied to clipboard."
      );
    },
    [copyToClipboard]
  );

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
          <Badge className={getSecretTypeColor(row.original.type)}>
            {row.original.type.replace("kubernetes.io/", "")}
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
      queryKey={[toPlural(ResourceType.Secret), currentNamespace]}
      queryFn={async () => {
        const result = await commands.listSecrets({
          namespace: currentNamespace,
          labelSelector: null,
          fieldSelector: null,
          secretType: null,
          limit: null,
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
                  fetchResourceYaml(
                    ResourceType.Secret,
                    row.original.name,
                    row.original.namespace
                  )
                }
              />
              <YamlEditorMenuAction
                title={`Edit Secret: ${row.original.name}`}
                resourceKey={{
                  kind: ResourceType.Secret,
                  name: row.original.name,
                  namespace: row.original.namespace,
                }}
                fetchYaml={() =>
                  fetchResourceYaml(
                    ResourceType.Secret,
                    row.original.name,
                    row.original.namespace
                  )
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
          await commands.deleteSecret(item.name, item.namespace);
        },
        invalidateQueryKeys: [[toPlural(ResourceType.Secret)]],
        resourceType: ResourceType.Secret,
      }}
      staleTime={10000}
      watchResourceType={ResourceType.Secret}
    />
  );
}
