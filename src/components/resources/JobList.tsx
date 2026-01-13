import { Link } from "react-router-dom";
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
type JobInfoWithMetrics = JobInfo & ResourceMetrics;

export function JobList() {
  const { currentNamespace } = useClusterStore();
  const { hasAccess } = usePremiumFeature();

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
        columns={(setDeleteTarget) => [
          ...columns,
          {
            id: "actions",
            cell: ({ row }) => (
              <ActionMenu>
                <DropdownMenuItem asChild>
                  <Link
                    to={getResourceDetailUrl(ResourceType.Job, row.original.name, row.original.namespace)}
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
          invalidateQueryKeys: [queryKeys.resources(ResourceType.Job, currentNamespace)],
          resourceType: ResourceType.Job,
        }}
        emptyStateLabel="jobs"
        getRowHref={(row) => getResourceDetailUrl(ResourceType.Job, row.name, row.namespace)}
      />
    </div>
  );
}
