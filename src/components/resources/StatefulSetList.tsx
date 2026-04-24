import { useNavigate } from "react-router-dom";
import { useClusterStore } from "@/stores/clusterStore";
import { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { ResourceList } from "./ResourceList";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { useResourceList } from "@/hooks/useResource";
import {
  attachAggregatedPodMetrics,
  matchStatefulSetPods,
  type ResourceMetrics,
} from "@/lib/metrics";
import { ResourceType } from "@/lib/resource-registry";
import { queryKeys } from "@/lib/query-keys";
import { getResourceDetailUrl, getResourceListUrl } from "@/lib/navigation-utils";
import type { StatefulSetInfo } from "@/generated/types";
import { commands } from "@/lib/commands";
import type { QuickAction } from "@/components/ui/quick-actions";
import { Eye, Trash2 } from "lucide-react";
import { MetricsStatusBanner } from "@/components/metrics";
import {
  createNameColumn,
  createNamespaceColumn,
  createAgeColumn,
  createCpuColumn,
  createMemoryColumn,
  createReplicasColumn,
} from "./columns";
import { getResourceRowId } from "@/lib/table-utils";

// Extended Info with metrics
type StatefulSetInfoWithMetrics = StatefulSetInfo & ResourceMetrics;

export function StatefulSetList() {
  const { currentNamespace } = useClusterStore();
  const navigate = useNavigate();

  // Use centralized pods with metrics hook
  const {
    data: podsWithMetrics,
    podStatus,
    isLoading: isLoadingPods,
  } = usePodsWithMetrics();

  const statefulSetsQuery = useResourceList(
    queryKeys.resources(ResourceType.StatefulSet, currentNamespace),
    () => commands.listStatefulsets({
      namespace: currentNamespace || null,
      labelSelector: null,
      fieldSelector: null,
      limit: null,
    })
  );

  const statefulSetsWithMetrics = useMemo(() => {
    return attachAggregatedPodMetrics(
      statefulSetsQuery.data ?? [],
      podsWithMetrics,
      matchStatefulSetPods
    );
  }, [statefulSetsQuery.data, podsWithMetrics]);

  const columns = useMemo<ColumnDef<StatefulSetInfoWithMetrics>[]>(
    () => [
      createNameColumn<StatefulSetInfoWithMetrics>(getResourceListUrl(ResourceType.StatefulSet)),
      createNamespaceColumn<StatefulSetInfoWithMetrics>(),
      createCpuColumn<StatefulSetInfoWithMetrics>(),
      createMemoryColumn<StatefulSetInfoWithMetrics>(),
      createReplicasColumn<StatefulSetInfoWithMetrics>(),
      createAgeColumn<StatefulSetInfoWithMetrics>(),
    ],
    []
  );

  const quickActions = useMemo<(setDeleteTarget: (item: StatefulSetInfoWithMetrics) => void) => QuickAction<StatefulSetInfoWithMetrics>[]>(
    () => (setDeleteTarget) => [
      {
        icon: Eye,
        label: "View Details",
        onClick: (item) => navigate(getResourceDetailUrl(ResourceType.StatefulSet, item.name, item.namespace)),
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
    <div className="space-y-4">
      {podStatus?.status !== "available" && (
        <MetricsStatusBanner status={podStatus} />
      )}
      <ResourceList<StatefulSetInfoWithMetrics>
        title="StatefulSets"
        data={statefulSetsWithMetrics}
        isLoading={statefulSetsQuery.isLoading || isLoadingPods}
        dataUpdatedAt={statefulSetsQuery.dataUpdatedAt}
        getRowId={getResourceRowId}
        columns={columns}
        quickActions={quickActions}
        deleteConfig={{
          mutationFn: async (item) => {
            await commands.deleteStatefulset(item.name, item.namespace);
          },
          invalidateQueryKeys: [queryKeys.resources(ResourceType.StatefulSet, currentNamespace)],
          resourceType: ResourceType.StatefulSet,
        }}
        emptyStateLabel="statefulsets"
        getRowHref={(row) => getResourceDetailUrl(ResourceType.StatefulSet, row.name, row.namespace)}
      />
    </div>
  );
}
