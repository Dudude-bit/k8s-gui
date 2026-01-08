import { Link } from "react-router-dom";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { ResourceList } from "./ResourceList";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { useResourceList } from "@/hooks/useResource";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { MetricBadge } from "@/components/ui/metric-card";
import {
  attachAggregatedPodMetrics,
  matchCronJobPods,
  type ResourceMetrics,
} from "@/lib/metrics";
import { formatAge } from "@/lib/utils";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import type { CronJobInfo } from "@/generated/types";
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
type CronJobInfoWithMetrics = CronJobInfo & ResourceMetrics;

export function CronJobList() {
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

  const cronJobsQuery = useResourceList(
    [toPlural(ResourceType.CronJob), currentNamespace],
    async () => {
      try {
        return await commands.listCronjobs({
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

  const cronJobsWithMetrics = useMemo(() => {
    return attachAggregatedPodMetrics(
      cronJobsQuery.data ?? [],
      podsWithMetrics,
      matchCronJobPods
    );
  }, [cronJobsQuery.data, podsWithMetrics]);

  const refetch = useCallback(async () => {
    await Promise.all([cronJobsQuery.refetch(), refetchPods()]);
  }, [cronJobsQuery, refetchPods]);

  const columns = useMemo<ColumnDef<CronJobInfoWithMetrics>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to={`/${toPlural(ResourceType.CronJob)}/${row.original.namespace}/${row.original.name}`}
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
    <div className="space-y-4">
      {hasAccess && podStatus?.status !== "available" && (
        <MetricsStatusBanner status={podStatus} />
      )}
      <ResourceList<CronJobInfoWithMetrics>
        title="CronJobs"
        data={cronJobsWithMetrics}
        isLoading={cronJobsQuery.isLoading}
        isFetching={cronJobsQuery.isFetching || isFetchingPods || isLoadingPods}
        onRefresh={refetch}
        columns={(setDeleteTarget) => [
          ...columns,
          {
            id: "actions",
            cell: ({ row }) => (
              <ActionMenu>
                <DropdownMenuItem asChild>
                  <Link
                    to={`/${toPlural(ResourceType.CronJob)}/${row.original.namespace}/${row.original.name}`}
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
            await commands.deleteCronjob(item.name, item.namespace);
          },
          invalidateQueryKeys: [["cronjobs"]],
          resourceType: ResourceType.CronJob,
        }}
        emptyStateLabel="cronjobs"
      />
    </div>
  );
}
