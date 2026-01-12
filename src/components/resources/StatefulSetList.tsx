import { Link } from "react-router-dom";
import { useClusterStore } from "@/stores/clusterStore";
import { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { ResourceList } from "./ResourceList";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { useResourceList } from "@/hooks/useResource";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import {
  attachAggregatedPodMetrics,
  matchStatefulSetPods,
  type ResourceMetrics,
} from "@/lib/metrics";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { getResourceDetailUrl, getResourceListUrl } from "@/lib/navigation-utils";
import type { StatefulSetInfo } from "@/generated/types";
import { commands } from "@/lib/commands";
import { ActionMenu } from "@/components/ui/action-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
  const { hasAccess } = usePremiumFeature();

  // Use centralized pods with metrics hook
  const {
    data: podsWithMetrics,
    podStatus,
    isLoading: isLoadingPods,
    refetch: refetchPods,
  } = usePodsWithMetrics();

  const statefulSetsQuery = useResourceList(
    [toPlural(ResourceType.StatefulSet), currentNamespace],
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

  const refetch = useCallback(async () => {
    await Promise.all([statefulSetsQuery.refetch(), refetchPods()]);
  }, [statefulSetsQuery, refetchPods]);

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

  return (
    <div className="space-y-4">
      {hasAccess && podStatus?.status !== "available" && (
        <MetricsStatusBanner status={podStatus} />
      )}
      <ResourceList<StatefulSetInfoWithMetrics>
        title="StatefulSets"
        data={statefulSetsWithMetrics}
        isLoading={statefulSetsQuery.isLoading || isLoadingPods}
        onRefresh={refetch}
        getRowId={getResourceRowId}
        columns={(setDeleteTarget) => [
          ...columns,
          {
            id: "actions",
            cell: ({ row }) => (
              <ActionMenu>
                <DropdownMenuItem asChild>
                  <Link
                    to={getResourceDetailUrl(ResourceType.StatefulSet, row.original.name, row.original.namespace)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </Link>
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
        deleteConfig={{
          mutationFn: async (item) => {
            await commands.deleteStatefulset(item.name, item.namespace);
          },
          invalidateQueryKeys: [["statefulsets"]],
          resourceType: ResourceType.StatefulSet,
        }}
        emptyStateLabel="statefulsets"
        getRowHref={(row) => getResourceDetailUrl(ResourceType.StatefulSet, row.name, row.namespace)}
      />
    </div>
  );
}
