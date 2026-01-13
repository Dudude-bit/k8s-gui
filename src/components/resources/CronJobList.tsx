import { Link } from "react-router-dom";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { ResourceList } from "./ResourceList";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { useResourceList } from "@/hooks/useResource";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import {
  attachAggregatedPodMetrics,
  matchCronJobPods,
  type ResourceMetrics,
} from "@/lib/metrics";
import { RealtimeAge } from "@/components/ui/realtime";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { getResourceDetailUrl, getResourceListUrl } from "@/lib/navigation-utils";
import type { CronJobInfo } from "@/generated/types";
import { commands } from "@/lib/commands";
import { ActionMenu } from "@/components/ui/action-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
type CronJobInfoWithMetrics = CronJobInfo & ResourceMetrics;

export function CronJobList() {
  const { currentNamespace } = useClusterStore();
  const { hasAccess } = usePremiumFeature();

  // Use centralized pods with metrics hook
  const {
    data: podsWithMetrics,
    podStatus,
    isLoading: isLoadingPods,
  } = usePodsWithMetrics();

  const cronJobsQuery = useResourceList(
    [toPlural(ResourceType.CronJob), currentNamespace],
    () => commands.listCronjobs({
      namespace: currentNamespace || null,
      labelSelector: null,
      fieldSelector: null,
      limit: null,
    })
  );

  const cronJobsWithMetrics = useMemo(() => {
    return attachAggregatedPodMetrics(
      cronJobsQuery.data ?? [],
      podsWithMetrics,
      matchCronJobPods
    );
  }, [cronJobsQuery.data, podsWithMetrics]);

  const columns = useMemo<ColumnDef<CronJobInfoWithMetrics>[]>(
    () => [
      createNameColumn<CronJobInfoWithMetrics>(getResourceListUrl(ResourceType.CronJob)),
      createNamespaceColumn<CronJobInfoWithMetrics>(),
      createCpuColumn<CronJobInfoWithMetrics>(),
      createMemoryColumn<CronJobInfoWithMetrics>(),
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
          row.original.lastSchedule ? (
            <><RealtimeAge timestamp={row.original.lastSchedule} /> ago</>
          ) : (
            "Never"
          ),
      },
      createAgeColumn<CronJobInfoWithMetrics>(),
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
        isLoading={cronJobsQuery.isLoading || isLoadingPods}
        getRowId={getResourceRowId}
        columns={(setDeleteTarget) => [
          ...columns,
          {
            id: "actions",
            cell: ({ row }) => (
              <ActionMenu>
                <DropdownMenuItem asChild>
                  <Link
                    to={getResourceDetailUrl(ResourceType.CronJob, row.original.name, row.original.namespace)}
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
        getRowHref={(row) => getResourceDetailUrl(ResourceType.CronJob, row.name, row.namespace)}
      />
    </div>
  );
}
