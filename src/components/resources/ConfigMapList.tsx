import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { ColumnDef } from "@tanstack/react-table";
import { Trash2, Copy } from "lucide-react";
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
  createSimpleNameColumn,
  createNamespaceColumn,
  createAgeColumn,
  createDataKeysColumn,
} from "./columns";

interface ConfigMapInfo {
  name: string;
  namespace: string;
  uid: string;
  data_keys: string[];
  labels: Record<string, string>;
  created_at: string | null;
}

export function ConfigMapList() {
  const { currentNamespace } = useClusterStore();
  const copyToClipboard = useCopyToClipboard();

  const handleCopyData = useCallback(async (name: string, namespace: string) => {
    try {
      const data = await invoke<Record<string, string>>("get_configmap_data", {
        name,
        namespace,
      });
      copyToClipboard(JSON.stringify(data, null, 2), "ConfigMap data copied to clipboard.");
    } catch (error) {
      // Error is handled by copyToClipboard's toast
    }
  }, [copyToClipboard]);

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
    <ResourceList<ConfigMapInfo>
      title="ConfigMaps"
      queryKey={["configmaps", currentNamespace]}
      queryFn={async () => {
        const result = await invoke<ConfigMapInfo[]>("list_configmaps", {
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
                title="ConfigMap YAML"
                description={`${row.original.namespace}/${row.original.name}`}
                fetchYaml={() =>
                  invoke<string>("get_configmap_yaml", {
                    name: row.original.name,
                    namespace: row.original.namespace,
                  })
                }
              />
              <YamlEditorMenuAction
                title={`Edit ConfigMap: ${row.original.name}`}
                resourceKey={{
                  kind: "ConfigMap",
                  name: row.original.name,
                  namespace: row.original.namespace,
                }}
                fetchYaml={() =>
                  invoke<string>("get_configmap_yaml", {
                    name: row.original.name,
                    namespace: row.original.namespace,
                  })
                }
              />
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
          await invoke("delete_configmap", {
            name: item.name,
            namespace: item.namespace,
          });
        },
        invalidateQueryKeys: [["configmaps"]],
        resourceType: "ConfigMap",
      }}
      staleTime={10000}
    />
  );
}
