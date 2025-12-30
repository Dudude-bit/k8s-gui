import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { useMemo, useCallback } from "react";
import { ResourceList } from "./ResourceList";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { MetricBadge } from "@/components/ui/metric-card";
import { aggregatePodMetrics } from "@/lib/k8s-quantity";
import { formatAge } from "@/lib/utils";
import type { CronJobInfo, PodInfo } from "@/generated/types";
import * as commands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";

// Extended Info with metrics
type CronJobInfoWithMetrics = CronJobInfo & {
  cpuUsage: string | null;
  memoryUsage: string | null;
};

export function CronJobList() {
  const { currentNamespace } = useClusterStore();

  // Use centralized pods with metrics hook
  const { data: podsWithMetrics } = usePodsWithMetrics();

  // CronJobs need to match pods via their Jobs
  const matchCronJobPods = useCallback(
    (cronJob: CronJobInfo, pod: PodInfo): boolean => {
      // CronJob pods have name pattern: {cronjob-name}-{timestamp}-{hash}
      // We match if the pod name starts with the cronjob name followed by a dash
      return (
        pod.namespace === cronJob.namespace &&
        pod.name.startsWith(cronJob.name + "-")
      );
    },
    []
  );

  // Query function that merges resources with aggregated metrics
  const queryFn = async (): Promise<CronJobInfoWithMetrics[]> => {
    try {
      const items = await commands.listCronjobs({
        namespace: currentNamespace || null,
        labelSelector: null,
        fieldSelector: null,
        limit: null,
      });

      // Aggregate metrics per resource
      return items.map((item) => {
        const matchedPods = podsWithMetrics.filter((pod) =>
          matchCronJobPods(item, pod)
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

  const columns = useMemo<ColumnDef<CronJobInfoWithMetrics>[]>(
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
      { accessorKey: "schedule", header: "Schedule" },
      {
        id: "suspend",
        header: "Suspend",
        cell: ({ row }) => (
          <Badge variant={row.original.suspend ? "destructive" : "secondary"}>
            {row.original.suspend ? "Yes" : "No"}
          </Badge>
        ),
      },
      {
        id: "active",
        header: "Active",
        cell: ({ row }) => row.original.active,
      },
      {
        id: "last_schedule",
        header: "Last Schedule",
        cell: ({ row }) =>
          row.original.lastSchedule
            ? formatAge(row.original.lastSchedule) + " ago"
            : "Never",
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
    <ResourceList<CronJobInfoWithMetrics>
      title="CronJobs"
      queryKey={[
        "cronjobs",
        currentNamespace,
        JSON.stringify(podsWithMetrics.map((p) => p.name)),
      ]}
      queryFn={queryFn}
      columns={columns}
      emptyStateLabel="cronjobs"
      staleTime={10000}
      refetchInterval={15000}
    />
  );
}
