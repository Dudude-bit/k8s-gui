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
  matchDaemonSetPods,
  type ResourceMetrics,
} from "@/lib/metrics";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { getResourceDetailUrl, getResourceListUrl } from "@/lib/navigation-utils";
import type { DaemonSetInfo } from "@/generated/types";
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
} from "./columns";
import { getResourceRowId } from "@/lib/table-utils";

// Extended Info with metrics
type DaemonSetInfoWithMetrics = DaemonSetInfo & ResourceMetrics;

export function DaemonSetList() {
  const { currentNamespace } = useClusterStore();
  const { hasAccess } = usePremiumFeature();

  // Use centralized pods with metrics hook
  const {
    data: podsWithMetrics,
    podStatus,
    isLoading: isLoadingPods,
    refetch: refetchPods,
  } = usePodsWithMetrics();

  const daemonSetsQuery = useResourceList(
    [toPlural(ResourceType.DaemonSet), currentNamespace],
    () => commands.listDaemonsets({
      namespace: currentNamespace || null,
      labelSelector: null,
      fieldSelector: null,
      limit: null,
    })
  );

  const daemonSetsWithMetrics = useMemo(() => {
    return attachAggregatedPodMetrics(
      daemonSetsQuery.data ?? [],
      podsWithMetrics,
      matchDaemonSetPods
    );
  }, [daemonSetsQuery.data, podsWithMetrics]);

  const refetch = useCallback(async () => {
    await Promise.all([daemonSetsQuery.refetch(), refetchPods()]);
  }, [daemonSetsQuery, refetchPods]);

  const columns = useMemo<ColumnDef<DaemonSetInfoWithMetrics>[]>(
    () => [
      createNameColumn<DaemonSetInfoWithMetrics>(getResourceListUrl(ResourceType.DaemonSet)),
      createNamespaceColumn<DaemonSetInfoWithMetrics>(),
      createCpuColumn<DaemonSetInfoWithMetrics>(),
      createMemoryColumn<DaemonSetInfoWithMetrics>(),
      {
        id: "desired",
        header: "Desired",
        cell: ({ row }) => row.original.desired,
      },
      {
        id: "current",
        header: "Current",
        cell: ({ row }) => row.original.current,
      },
      {
        id: "ready",
        header: "Ready",
        cell: ({ row }) => {
          const { ready, desired } = row.original;
          return (
            <span
              className={
                ready === desired ? "text-green-500" : "text-yellow-500"
              }
            >
              {ready}
            </span>
          );
        },
      },
      createAgeColumn<DaemonSetInfoWithMetrics>(),
    ],
    []
  );

  return (
    <div className="space-y-4">
      {hasAccess && podStatus?.status !== "available" && (
        <MetricsStatusBanner status={podStatus} />
      )}
      <ResourceList<DaemonSetInfoWithMetrics>
        title="DaemonSets"
        data={daemonSetsWithMetrics}
        isLoading={daemonSetsQuery.isLoading || isLoadingPods}
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
                    to={getResourceDetailUrl(ResourceType.DaemonSet, row.original.name, row.original.namespace)}
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
            await commands.deleteDaemonset(item.name, item.namespace);
          },
          invalidateQueryKeys: [["daemonsets"]],
          resourceType: ResourceType.DaemonSet,
        }}
        emptyStateLabel="daemonsets"
        getRowHref={(row) => getResourceDetailUrl(ResourceType.DaemonSet, row.name, row.namespace)}
      />
    </div>
  );
}
