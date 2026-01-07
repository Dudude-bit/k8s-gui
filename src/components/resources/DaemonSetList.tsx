import { Link } from "react-router-dom";
import { useClusterStore } from "@/stores/clusterStore";
import { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { ResourceList } from "./ResourceList";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { matchDaemonSetPods } from "@/hooks/useResourceWithMetrics";
import { MetricBadge } from "@/components/ui/metric-card";
import { aggregatePodMetrics } from "@/lib/k8s-quantity";
import { formatAge } from "@/lib/utils";
import { ResourceType, toPlural } from "@/lib/resource-types";
import type { DaemonSetInfo } from "@/generated/types";
import * as commands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";
import { ActionMenu } from "@/components/ui/action-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Eye, Trash2 } from "lucide-react";

// Extended Info with metrics
type DaemonSetInfoWithMetrics = DaemonSetInfo & {
  cpuUsage: string | null;
  memoryUsage: string | null;
};

export function DaemonSetList() {
  const { currentNamespace } = useClusterStore();

  // Use centralized pods with metrics hook
  const { data: podsWithMetrics } = usePodsWithMetrics();

  // Query function that merges resources with aggregated metrics
  const queryFn = async (): Promise<DaemonSetInfoWithMetrics[]> => {
    try {
      const items = await commands.listDaemonsets({
        namespace: currentNamespace || null,
        labelSelector: null,
        fieldSelector: null,
        limit: null,
      });

      // Aggregate metrics per resource
      return items.map((item) => {
        const matchedPods = podsWithMetrics.filter((pod) =>
          matchDaemonSetPods(item, pod)
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

  const columns = useMemo<ColumnDef<DaemonSetInfoWithMetrics>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to={`/${toPlural(ResourceType.DaemonSet)}/${row.original.namespace}/${row.original.name}`}
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
      {
        id: "age",
        header: "Age",
        cell: ({ row }) => formatAge(row.original.createdAt),
      },
    ],
    []
  );

  return (
    <ResourceList<DaemonSetInfoWithMetrics>
      title="DaemonSets"
      queryKey={[
        "daemonsets",
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
      staleTime={10000}
      refetchInterval={15000}
    />
  );
}
