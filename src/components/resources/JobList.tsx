import { useNavigate } from "react-router-dom";
import { useClusterStore } from "@/stores/clusterStore";
import { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { ResourceList } from "./ResourceList";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { useResourceList } from "@/hooks/useResource";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  attachAggregatedPodMetrics,
  matchJobPods,
  type ResourceMetrics,
} from "@/lib/metrics";
import { ResourceType } from "@/lib/resource-registry";
import { queryKeys } from "@/lib/query-keys";
import { getResourceDetailUrl, getResourceListUrl } from "@/lib/navigation-utils";
import type { JobInfo } from "@/generated/types";
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
type JobInfoWithMetrics = JobInfo & ResourceMetrics;

export function JobList() {
  const { currentNamespace } = useClusterStore();
  const { hasAccess } = usePremiumFeature();
  const navigate = useNavigate();

  // Use centralized pods with metrics hook
  const {
    data: podsWithMetrics,
    podStatus,
    isLoading: isLoadingPods,
  } = usePodsWithMetrics();

  const jobsQuery = useResourceList(
    queryKeys.resources(ResourceType.Job, currentNamespace),
    () => commands.listJobs({
      namespace: currentNamespace || null,
      labelSelector: null,
      fieldSelector: null,
      limit: null,
    })
  );

  const jobsWithMetrics = useMemo(() => {
    return attachAggregatedPodMetrics(
      jobsQuery.data ?? [],
      podsWithMetrics,
      matchJobPods
    );
  }, [jobsQuery.data, podsWithMetrics]);

  const columns = useMemo<ColumnDef<JobInfoWithMetrics>[]>(
    () => [
      createNameColumn<JobInfoWithMetrics>(getResourceListUrl(ResourceType.Job)),
      createNamespaceColumn<JobInfoWithMetrics>(),
      createCpuColumn<JobInfoWithMetrics>(),
      createMemoryColumn<JobInfoWithMetrics>(),
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
      createAgeColumn<JobInfoWithMetrics>(),
    ],
    []
  );

  const quickActions = useMemo<(setDeleteTarget: (item: JobInfoWithMetrics) => void) => QuickAction<JobInfoWithMetrics>[]>(
    () => (setDeleteTarget) => [
      {
        icon: Eye,
        label: "View Details",
        onClick: (item) => navigate(getResourceDetailUrl(ResourceType.Job, item.name, item.namespace)),
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
      <ResourceList<JobInfoWithMetrics>
        title="Jobs"
        data={jobsWithMetrics}
        isLoading={jobsQuery.isLoading || isLoadingPods}
        getRowId={getResourceRowId}
        columns={columns}
        quickActions={quickActions}
        deleteConfig={{
          mutationFn: async (item) => {
            await commands.deleteJob(item.name, item.namespace);
          },
          invalidateQueryKeys: [queryKeys.resources(ResourceType.Job, currentNamespace)],
          resourceType: ResourceType.Job,
        }}
        emptyStateLabel="jobs"
        getRowHref={(row) => getResourceDetailUrl(ResourceType.Job, row.name, row.namespace)}
      />
    </div>
  );
}
