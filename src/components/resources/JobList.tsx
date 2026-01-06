import { useClusterStore } from "@/stores/clusterStore";
import { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { ResourceList } from "./ResourceList";
import { ResourceType } from "@/hooks/useResourceWatch";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { matchJobPods } from "@/hooks/useResourceWithMetrics";
import { MetricBadge } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { aggregatePodMetrics } from "@/lib/k8s-quantity";
import { formatAge } from "@/lib/utils";
import type { JobInfo } from "@/generated/types";
import * as commands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";

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
      columns={columns}
      emptyStateLabel="jobs"
      staleTime={10000}
      refetchInterval={15000}
      watchResourceType={ResourceType.Job}
    />
  );
}
