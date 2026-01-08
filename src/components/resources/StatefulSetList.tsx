import { Link } from "react-router-dom";
import { useClusterStore } from "@/stores/clusterStore";
import { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { ResourceList } from "./ResourceList";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { MetricBadge } from "@/components/ui/metric-card";
import {
  attachAggregatedPodMetrics,
  matchStatefulSetPods,
  type ResourceMetrics,
} from "@/lib/metrics";
import { formatAge } from "@/lib/utils";
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

// Extended Info with metrics
type StatefulSetInfoWithMetrics = StatefulSetInfo & ResourceMetrics;

export function StatefulSetList() {
  const { currentNamespace } = useClusterStore();
  const { hasAccess } = usePremiumFeature();

  // Use centralized pods with metrics hook
  const { data: podsWithMetrics, podStatus } = usePodsWithMetrics();

  // Query function that merges resources with aggregated metrics
  const queryFn = async (): Promise<StatefulSetInfoWithMetrics[]> => {
    try {
      const items = await commands.listStatefulsets({
        namespace: currentNamespace || null,
        labelSelector: null,
        fieldSelector: null,
        limit: null,
      });

      return attachAggregatedPodMetrics(
        items,
        podsWithMetrics,
        matchStatefulSetPods
      );
    } catch (err) {
      throw new Error(normalizeTauriError(err));
    }
  };

  const columns = useMemo<ColumnDef<StatefulSetInfoWithMetrics>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to={`/${toPlural(ResourceType.StatefulSet)}/${row.original.namespace}/${row.original.name}`}
            className="font-medium text-primary hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
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
      {
        id: "age",
        header: "Age",
        cell: ({ row }) => formatAge(row.original.createdAt),
      },
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
        queryKey={[
          "statefulsets",
          currentNamespace,
          JSON.stringify(podsWithMetrics.map((p) => p.name)),
        ]}
        queryFn={queryFn}
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
        staleTime={10000}
        refetchInterval={15000}
      />
    </div>
  );
}
