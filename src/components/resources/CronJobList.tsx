import { useNavigate } from "react-router-dom";
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
import { ResourceType } from "@/lib/resource-registry";
import { queryKeys } from "@/lib/query-keys";
import { getResourceDetailUrl, getResourceListUrl } from "@/lib/navigation-utils";
import type { CronJobInfo } from "@/generated/types";
import { commands } from "@/lib/commands";
import type { QuickAction } from "@/components/ui/quick-actions";
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
  const navigate = useNavigate();

  // Use centralized pods with metrics hook
  const {
    data: podsWithMetrics,
    podStatus,
    isLoading: isLoadingPods,
  } = usePodsWithMetrics();

  const cronJobsQuery = useResourceList(
    queryKeys.resources(ResourceType.CronJob, currentNamespace),
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

  const quickActions = useMemo<(setDeleteTarget: (item: CronJobInfoWithMetrics) => void) => QuickAction<CronJobInfoWithMetrics>[]>(
    () => (setDeleteTarget) => [
      {
        icon: Eye,
        label: "View Details",
        onClick: (item) => navigate(getResourceDetailUrl(ResourceType.CronJob, item.name, item.namespace)),
      },
      {
        icon: Trash2,
        label: "Delete",
        onClick: (item) => setDeleteTarget(item),
        variant: "destructive",
      },
    ],
    [navigate]
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
        columns={columns}
        quickActions={quickActions}
        deleteConfig={{
          mutationFn: async (item) => {
            await commands.deleteCronjob(item.name, item.namespace);
          },
          invalidateQueryKeys: [queryKeys.resources(ResourceType.CronJob, currentNamespace)],
          resourceType: ResourceType.CronJob,
        }}
        emptyStateLabel="cronjobs"
        getRowHref={(row) => getResourceDetailUrl(ResourceType.CronJob, row.name, row.namespace)}
      />
    </div>
  );
}
