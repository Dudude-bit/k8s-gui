import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { Trash2, Copy } from "lucide-react";
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
  const { toast } = useToast();

  const handleCopyData = useCallback(async (name: string, namespace: string) => {
    try {
      const data = await invoke<Record<string, string>>("get_configmap_data", {
        name,
        namespace,
      });
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      toast({
        title: "Copied",
        description: "ConfigMap data copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to copy data: ${error}`,
        variant: "destructive",
      });
    }
  }, [toast]);

  const columns = useMemo<ColumnDef<ConfigMapInfo>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "namespace",
        header: "Namespace",
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
        invalidateQueryKey: ["configmaps"],
        successTitle: "ConfigMap deleted",
        successDescription: "The ConfigMap has been deleted successfully.",
        errorPrefix: "Failed to delete ConfigMap",
      }}
      staleTime={10000}
    />
  );
}
