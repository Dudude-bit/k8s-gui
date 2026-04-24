import { commands } from "@/lib/commands";
import { useClusterStore } from "@/stores/clusterStore";
import { ColumnDef } from "@tanstack/react-table";
import { Trash2, Eye } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { ConfigMapInfo } from "@/generated/types";
import { ResourceList } from "./ResourceList";
import { ResourceType } from "@/lib/resource-registry";
import { queryKeys } from "@/lib/query-keys";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import { STALE_TIMES } from "@/lib/refresh";
import {
  createNameColumn,
  createNamespaceColumn,
  createAgeColumn,
  createDataKeysColumn,
} from "./columns";
import { getResourceRowId } from "@/lib/table-utils";
import type { QuickAction } from "@/components/ui/quick-actions";

export function ConfigMapList() {
  const { currentNamespace } = useClusterStore();
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<ConfigMapInfo>[]>(
    () => [
      createNameColumn<ConfigMapInfo>(getResourceDetailUrl(ResourceType.ConfigMap, "", "")),
      createNamespaceColumn<ConfigMapInfo>(),
      createDataKeysColumn<ConfigMapInfo>(),
      createAgeColumn<ConfigMapInfo>(),
    ],
    []
  );

  const quickActions = useMemo<(setDeleteTarget: (item: ConfigMapInfo) => void) => QuickAction<ConfigMapInfo>[]>(
    () => (setDeleteTarget) => [
      {
        icon: Eye,
        label: "View Details",
        onClick: (item) => navigate(getResourceDetailUrl(ResourceType.ConfigMap, item.name, item.namespace)),
      },
      {
        icon: Trash2,
        label: "Delete",
        onClick: (item) => setDeleteTarget(item),
        variant: "destructive",
      },
    ],
    [navigate]
  );

  return (
    <ResourceList<ConfigMapInfo>
      title="ConfigMaps"
      queryKey={queryKeys.resources(ResourceType.ConfigMap, currentNamespace)}
      getRowId={getResourceRowId}
      queryFn={async () => {
        const result = await commands.listConfigmaps({
          namespace: currentNamespace,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
        });
        return result;
      }}
      columns={columns}
      quickActions={quickActions}
      emptyStateLabel="ConfigMaps"
      getRowHref={(row) => getResourceDetailUrl(ResourceType.ConfigMap, row.name, row.namespace)}
      deleteConfig={{
        mutationFn: async (item) => {
          await commands.deleteConfigmap(item.name, item.namespace);
        },
        invalidateQueryKeys: [queryKeys.resources(ResourceType.ConfigMap, currentNamespace)],
        resourceType: ResourceType.ConfigMap,
      }}
      staleTime={STALE_TIMES.resourceList}
    />
  );
}
