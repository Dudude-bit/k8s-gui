import { Link } from "react-router-dom";
import { useClusterStore } from "@/stores/clusterStore";
import { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { ResourceList } from "./ResourceList";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { useResourceList } from "@/hooks/useResource";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { MetricBadge } from "@/components/ui/metric-card";
import {
  attachAggregatedPodMetrics,
  matchStatefulSetPods,
  type ResourceMetrics,
} from "@/lib/metrics";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import type { StatefulSetInfo } from "@/generated/types";
import { commands } from "@/lib/commands";
import { normalizeTauriError } from "@/lib/error-utils";
import { ActionMenu } from "@/components/ui/action-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Eye, Trash2 } from "lucide-react";
import { MetricsStatusBanner } from "@/components/metrics";
import { createNameColumn, createAgeColumn } from "./columns";

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
    isFetching: isFetchingPods,
    refetch: refetchPods,
  } = usePodsWithMetrics();

  const statefulSetsQuery = useResourceList(
    [toPlural(ResourceType.StatefulSet), currentNamespace],
    async () => {
      try {
        return await commands.listStatefulsets({
          namespace: currentNamespace || null,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
        });
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    }
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

  const statefulSetUrlPrefix = `/${toPlural(ResourceType.StatefulSet)}`;

  const columns = useMemo<ColumnDef<StatefulSetInfoWithMetrics>[]>(
    () => [
      createNameColumn<StatefulSetInfoWithMetrics>(statefulSetUrlPrefix, { disableLink: true }),
      { accessorKey: "namespace", header: "Namespace" },
      {
        id: "cpu",
        header: "CPU",
        cell: ({ row }) => (
          <MetricBadge used={row.original.cpuMillicores} type="cpu" />
        ),
      },
      {
        id: "memory",
        header: "Memory",
        cell: ({ row }) => (
          <MetricBadge used={row.original.memoryBytes} type="memory" />
        ),
      },
      {
        id: "replicas",
        header: "Replicas",
        cell: ({ row }) => {
          const { ready, desired } = row.original.replicas;
          return (
            <span
              className={
                ready === desired ? "text-green-500" : "text-yellow-500"
              }
            >
              {ready}/{desired}
            </span>
          );
        },
      },
      createAgeColumn<StatefulSetInfoWithMetrics>(),
    ],
    [statefulSetUrlPrefix]
  );

  return (
    <div className="space-y-4">
      {hasAccess && podStatus?.status !== "available" && (
        <MetricsStatusBanner status={podStatus} />
      )}
      <ResourceList<StatefulSetInfoWithMetrics>
        title="StatefulSets"
        data={statefulSetsWithMetrics}
        isLoading={statefulSetsQuery.isLoading}
        isFetching={
          statefulSetsQuery.isFetching || isFetchingPods || isLoadingPods
        }
        onRefresh={refetch}
        columns={(setDeleteTarget) => [
          ...columns,
          {
            id: "actions",
            cell: ({ row }) => (
              <ActionMenu>
                <DropdownMenuItem asChild>
                  <Link
                    to={`/${toPlural(ResourceType.StatefulSet)}/${row.original.namespace}/${row.original.name}`}
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
        getRowHref={(row) => `${statefulSetUrlPrefix}/${row.namespace}/${row.name}`}
      />
    </div>
  );
}
