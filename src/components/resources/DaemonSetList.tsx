import { useNavigate } from "react-router-dom";
import { useClusterStore } from "@/stores/clusterStore";
import { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { ResourceList } from "./ResourceList";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { useResourceList } from "@/hooks/useResource";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import {
  attachAggregatedPodMetrics,
  matchDaemonSetPods,
  type ResourceMetrics,
} from "@/lib/metrics";
import { ResourceType } from "@/lib/resource-registry";
import { queryKeys } from "@/lib/query-keys";
import { getResourceDetailUrl, getResourceListUrl } from "@/lib/navigation-utils";
import type { DaemonSetInfo } from "@/generated/types";
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
} from "./columns";
import { getResourceRowId } from "@/lib/table-utils";

// Extended Info with metrics
type DaemonSetInfoWithMetrics = DaemonSetInfo & ResourceMetrics;

export function DaemonSetList() {
  const { currentNamespace } = useClusterStore();
  const { hasAccess } = usePremiumFeature();
  const navigate = useNavigate();

  // Use centralized pods with metrics hook
  const {
    data: podsWithMetrics,
    podStatus,
    isLoading: isLoadingPods,
  } = usePodsWithMetrics();

  const daemonSetsQuery = useResourceList(
    queryKeys.resources(ResourceType.DaemonSet, currentNamespace),
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

  const quickActions = useMemo<(setDeleteTarget: (item: DaemonSetInfoWithMetrics) => void) => QuickAction<DaemonSetInfoWithMetrics>[]>(
    () => (setDeleteTarget) => [
      {
        icon: Eye,
        label: "View Details",
        onClick: (item) => navigate(getResourceDetailUrl(ResourceType.DaemonSet, item.name, item.namespace)),
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
      {hasAccess && podStatus?.status !== "available" && (
        <MetricsStatusBanner status={podStatus} />
      )}
      <ResourceList<DaemonSetInfoWithMetrics>
        title="DaemonSets"
        data={daemonSetsWithMetrics}
        isLoading={daemonSetsQuery.isLoading || isLoadingPods}
        getRowId={getResourceRowId}
        columns={columns}
        quickActions={quickActions}
        deleteConfig={{
          mutationFn: async (item) => {
            await commands.deleteDaemonset(item.name, item.namespace);
          },
          invalidateQueryKeys: [queryKeys.resources(ResourceType.DaemonSet, currentNamespace)],
          resourceType: ResourceType.DaemonSet,
        }}
        emptyStateLabel="daemonsets"
        getRowHref={(row) => getResourceDetailUrl(ResourceType.DaemonSet, row.name, row.namespace)}
      />
    </div>
  );
}
