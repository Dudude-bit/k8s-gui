import { useClusterStore } from "@/stores/clusterStore";
import { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { ResourceList } from "./ResourceList";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { matchStatefulSetPods } from "@/hooks/useResourceWithMetrics";
import { MetricBadge } from "@/components/ui/metric-card";
import { aggregatePodMetrics } from "@/lib/k8s-quantity";
import { formatAge } from "@/lib/utils";
import type { StatefulSetInfo } from "@/generated/types";
import * as commands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";

// Extended Info with metrics
type StatefulSetInfoWithMetrics = StatefulSetInfo & {
  cpuUsage: string | null;
  memoryUsage: string | null;
};

export function StatefulSetList() {
  const { currentNamespace } = useClusterStore();

  // Use centralized pods with metrics hook
  const { data: podsWithMetrics } = usePodsWithMetrics();

  // Query function that merges resources with aggregated metrics
  const queryFn = async (): Promise<StatefulSetInfoWithMetrics[]> => {
    try {
      const items = await commands.listStatefulsets({
        namespace: currentNamespace || null,
        labelSelector: null,
        fieldSelector: null,
        limit: null,
      });

      // Aggregate metrics per resource
      return items.map((item) => {
        const matchedPods = podsWithMetrics.filter((pod) =>
          matchStatefulSetPods(item, pod)
        );

        const aggregatedMetrics = aggregatePodMetrics(matchedPods);

        return {
          ...item,
          cpuUsage: aggregatedMetrics.cpuUsage,
          memoryUsage: aggregatedMetrics.memoryUsage,
        };
      });
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
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      { accessorKey: "namespace", header: "Namespace" },
      {
        id: "cpu",
        header: "CPU",
        cell: ({ row }) => (
          <MetricBadge used={row.original.cpuUsage} type="cpu" />
        ),
      },
      {
        id: "memory",
        header: "Memory",
        cell: ({ row }) => (
          <MetricBadge used={row.original.memoryUsage} type="memory" />
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
    <ResourceList<StatefulSetInfoWithMetrics>
      title="StatefulSets"
      queryKey={[
        "statefulsets",
        currentNamespace,
        JSON.stringify(podsWithMetrics.map((p) => p.name)),
      ]}
      queryFn={queryFn}
      columns={columns}
      emptyStateLabel="statefulsets"
      staleTime={10000}
      refetchInterval={15000}
    />
  );
}
