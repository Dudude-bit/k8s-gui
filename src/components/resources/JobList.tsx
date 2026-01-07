import { Link } from "react-router-dom";
import { useClusterStore } from "@/stores/clusterStore";
import { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { ResourceList } from "./ResourceList";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { matchJobPods } from "@/hooks/useResourceWithMetrics";
import { MetricBadge } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { aggregatePodMetrics } from "@/lib/k8s-quantity";
import { formatAge } from "@/lib/utils";
import { ResourceType, toPlural } from "@/lib/resource-types";
import type { JobInfo } from "@/generated/types";
import * as commands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";
import { ActionMenu } from "@/components/ui/action-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Eye, Trash2 } from "lucide-react";

// Extended Info with metrics
type JobInfoWithMetrics = JobInfo & {
  cpuUsage: string | null;
  memoryUsage: string | null;
};

export function JobList() {
  const { currentNamespace } = useClusterStore();

  // Use centralized pods with metrics hook
  const { data: podsWithMetrics } = usePodsWithMetrics();

  // Query function that merges resources with aggregated metrics
  const queryFn = async (): Promise<JobInfoWithMetrics[]> => {
    try {
      const items = await commands.listJobs({
        namespace: currentNamespace || null,
        labelSelector: null,
        fieldSelector: null,
        limit: null,
      });

      // Aggregate metrics per resource
      return items.map((item) => {
        const matchedPods = podsWithMetrics.filter((pod) =>
          matchJobPods(item, pod)
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

  const columns = useMemo<ColumnDef<JobInfoWithMetrics>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to={`/${toPlural(ResourceType.Job)}/${row.original.namespace}/${row.original.name}`}
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
        id: "completions",
        header: "Completions",
        cell: ({ row }) =>
          `${row.original.succeeded}/${row.original.completions || "∞"}`,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
    <ResourceList<JobInfoWithMetrics>
      title="Jobs"
      queryKey={[
        "jobs",
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
                  to={`/${toPlural(ResourceType.Job)}/${row.original.namespace}/${row.original.name}`}
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
          await commands.deleteJob(item.name, item.namespace);
        },
        invalidateQueryKeys: [["jobs"]],
        resourceType: ResourceType.Job,
      }}
      emptyStateLabel="jobs"
      staleTime={10000}
      refetchInterval={15000}
    />
  );
}
