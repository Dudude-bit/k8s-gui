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
  matchDaemonSetPods,
  type ResourceMetrics,
} from "@/lib/metrics";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import type { DaemonSetInfo } from "@/generated/types";
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
type DaemonSetInfoWithMetrics = DaemonSetInfo & ResourceMetrics;

export function DaemonSetList() {
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

  const daemonSetsQuery = useResourceList(
    [toPlural(ResourceType.DaemonSet), currentNamespace],
    async () => {
      try {
        return await commands.listDaemonsets({
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

  const daemonSetUrlPrefix = `/${toPlural(ResourceType.DaemonSet)}`;

  const columns = useMemo<ColumnDef<DaemonSetInfoWithMetrics>[]>(
    () => [
      createNameColumn<DaemonSetInfoWithMetrics>(daemonSetUrlPrefix, { disableLink: true }),
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
    [daemonSetUrlPrefix]
  );

  return (
    <div className="space-y-4">
      {hasAccess && podStatus?.status !== "available" && (
        <MetricsStatusBanner status={podStatus} />
      )}
      <ResourceList<DaemonSetInfoWithMetrics>
        title="DaemonSets"
        data={daemonSetsWithMetrics}
        isLoading={daemonSetsQuery.isLoading}
        isFetching={
          daemonSetsQuery.isFetching || isFetchingPods || isLoadingPods
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
                    to={`/${toPlural(ResourceType.DaemonSet)}/${row.original.namespace}/${row.original.name}`}
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
        getRowHref={(row) => `${daemonSetUrlPrefix}/${row.namespace}/${row.name}`}
      />
    </div>
  );
}
