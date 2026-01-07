import * as commands from "@/generated/commands";
import { fetchResourceYaml } from "@/hooks/useResourceYaml";
import { useClusterStore } from "@/stores/clusterStore";
import { ColumnDef } from "@tanstack/react-table";
import { Trash2, Copy, Eye } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useMemo, useCallback, useState } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { YamlEditorMenuAction } from "@/components/yaml";
import type { ConfigMapInfo } from "@/generated/types";
import { ResourceList } from "./ResourceList";
import { ResourceType, toPlural } from "@/lib/resource-types";
import { useCopyToClipboard } from "@/hooks";
import {
  createSimpleNameColumn,
  createNamespaceColumn,
  createAgeColumn,
  createDataKeysColumn,
} from "./columns";
import { ConfigMapDataDialog } from "./ConfigMapDataDialog";

export function ConfigMapList() {
  const { currentNamespace } = useClusterStore();
  const copyToClipboard = useCopyToClipboard();
  const [viewDataConfigMap, setViewDataConfigMap] = useState<ConfigMapInfo | null>(null);

  const handleCopyData = useCallback(
    async (name: string, namespace: string) => {
      try {
        const data = await commands.getConfigmapData(name, namespace);
        copyToClipboard(
          JSON.stringify(data, null, 2),
          "ConfigMap data copied to clipboard."
        );
      } catch (error) {
        // Error is handled by copyToClipboard's toast
      }
    },
    [copyToClipboard]
  );

  const columns = useMemo<ColumnDef<ConfigMapInfo>[]>(
    () => [
      createSimpleNameColumn<ConfigMapInfo>(),
      createNamespaceColumn<ConfigMapInfo>(),
      createDataKeysColumn<ConfigMapInfo>(),
      createAgeColumn<ConfigMapInfo>(),
    ],
    []
  );

  return (
    <>
    <ResourceList<ConfigMapInfo>
      title="ConfigMaps"
      queryKey={[toPlural(ResourceType.ConfigMap), currentNamespace]}
      queryFn={async () => {
        const result = await commands.listConfigmaps({
          namespace: currentNamespace,
          labelSelector: null,
          fieldSelector: null,
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
              <YamlEditorMenuAction
                title={`ConfigMap: ${row.original.name}`}
                resourceKey={{
                  kind: ResourceType.ConfigMap,
                  name: row.original.name,
                  namespace: row.original.namespace,
                }}
                fetchYaml={() =>
                  fetchResourceYaml(
                    ResourceType.ConfigMap,
                    row.original.name,
                    row.original.namespace
                  )
                }
                readOnly
                menuLabel="View YAML"
              />
              <YamlEditorMenuAction
                title={`Edit ConfigMap: ${row.original.name}`}
                resourceKey={{
                  kind: ResourceType.ConfigMap,
                  name: row.original.name,
                  namespace: row.original.namespace,
                }}
                fetchYaml={() =>
                  fetchResourceYaml(
                    ResourceType.ConfigMap,
                    row.original.name,
                    row.original.namespace
                  )
                }
              />
              <DropdownMenuItem onClick={() => setViewDataConfigMap(row.original)}>
                <Eye className="mr-2 h-4 w-4" />
                View Data
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  handleCopyData(row.original.name, row.original.namespace)
                }
              >
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
      ]}
      emptyStateLabel="ConfigMaps"
      deleteConfig={{
        mutationFn: async (item) => {
          await commands.deleteConfigmap(item.name, item.namespace);
        },
        invalidateQueryKeys: [[toPlural(ResourceType.ConfigMap)]],
        resourceType: ResourceType.ConfigMap,
      }}
      staleTime={10000}
    />

    <ConfigMapDataDialog
      open={viewDataConfigMap !== null}
      onOpenChange={(open) => !open && setViewDataConfigMap(null)}
      configMapName={viewDataConfigMap?.name ?? ""}
      namespace={viewDataConfigMap?.namespace ?? ""}
    />
    </>
  );
}
