import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "react-router-dom";
import { Eye, Trash2, RotateCw, Scale } from "lucide-react";
import { useMemo } from "react";
import { ResourceList } from "./ResourceList";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { queryKeys } from "@/lib/query-keys";
import { getResourceDetailUrl, getResourceListUrl } from "@/lib/navigation-utils";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { useResourceList } from "@/hooks/useResource";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  attachAggregatedPodMetrics,
  matchDeploymentPods,
  type ResourceMetrics,
} from "@/lib/metrics";
import {
  createNameColumn,
  createNamespaceColumn,
  createAgeColumn,
  createReplicasColumn,
  createCpuColumn,
  createMemoryColumn,
} from "./columns";
import type { DeploymentInfo } from "@/generated/types";
import { commands } from "@/lib/commands";
import { MetricsStatusBanner } from "@/components/metrics";
import { getResourceRowId } from "@/lib/table-utils";
import type { QuickAction } from "@/components/ui/quick-actions";

// Extended DeploymentInfo with metrics
type DeploymentInfoWithMetrics = DeploymentInfo & ResourceMetrics;

export function DeploymentList() {
  const { currentNamespace } = useClusterStore();
  const navigate = useNavigate();

  // Use centralized pods with metrics hook
  const {
    data: podsWithMetrics,
    podStatus,
    isLoading: isLoadingPods,
  } = usePodsWithMetrics();

  const deploymentsQuery = useResourceList(
    queryKeys.resources(ResourceType.Deployment, currentNamespace),
    () => commands.listDeployments({
      namespace: currentNamespace || null,
      labelSelector: null,
      fieldSelector: null,
      limit: null,
    })
  );

  const deploymentsWithMetrics = useMemo(() => {
    return attachAggregatedPodMetrics(
      deploymentsQuery.data ?? [],
      podsWithMetrics,
      matchDeploymentPods
    );
  }, [deploymentsQuery.data, podsWithMetrics]);

  const columns = useMemo<ColumnDef<DeploymentInfoWithMetrics>[]>(
    () => [
      createNameColumn<DeploymentInfoWithMetrics>(getResourceListUrl(ResourceType.Deployment)),
      createNamespaceColumn<DeploymentInfoWithMetrics>(),
      createCpuColumn<DeploymentInfoWithMetrics>(),
      createMemoryColumn<DeploymentInfoWithMetrics>(),
      createReplicasColumn<DeploymentInfoWithMetrics>(),
      {
        id: "strategy",
        header: "Strategy",
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.strategy || "RollingUpdate"}
          </Badge>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const available = row.original.replicas.available || 0;
          const total = row.original.replicas.desired;
          const status = available === total ? "Available" : "Progressing";
          return <StatusBadge status={status} />;
        },
      },
      createAgeColumn<DeploymentInfoWithMetrics>(),
    ],
    []
  );

  const quickActions = useMemo<(setDeleteTarget: (item: DeploymentInfoWithMetrics) => void) => QuickAction<DeploymentInfoWithMetrics>[]>(
    () => (setDeleteTarget) => [
      {
        icon: Eye,
        label: "View Details",
        onClick: (item) => navigate(getResourceDetailUrl(ResourceType.Deployment, item.name, item.namespace)),
      },
      {
        icon: Scale,
        label: "Scale",
        onClick: (item) => navigate(`${getResourceDetailUrl(ResourceType.Deployment, item.name, item.namespace)}?action=scale`),
      },
      {
        icon: RotateCw,
        label: "Restart",
        onClick: (item) => navigate(`${getResourceDetailUrl(ResourceType.Deployment, item.name, item.namespace)}?action=restart`),
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
      {podStatus?.status !== "available" && (
        <MetricsStatusBanner status={podStatus} />
      )}
      <ResourceList<DeploymentInfoWithMetrics>
        title="Deployments"
        data={deploymentsWithMetrics}
        isLoading={deploymentsQuery.isLoading || isLoadingPods}
        dataUpdatedAt={deploymentsQuery.dataUpdatedAt}
        getRowId={getResourceRowId}
        columns={columns}
        quickActions={quickActions}
        emptyStateLabel={toPlural(ResourceType.Deployment)}
        getRowHref={(row) => getResourceDetailUrl(ResourceType.Deployment, row.name, row.namespace)}
        deleteConfig={{
          mutationFn: (item) => commands.deleteDeployment(item.name, item.namespace),
          invalidateQueryKeys: [queryKeys.resources(ResourceType.Deployment, currentNamespace)],
          resourceType: ResourceType.Deployment,
        }}
      />
    </div>
  );
}
