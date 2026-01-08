import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye, Trash2, RotateCw, Scale } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useMemo } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { ResourceList } from "./ResourceList";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricBadge } from "@/components/ui/metric-card";
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
} from "./columns";
import type { DeploymentInfo } from "@/generated/types";
import { commands } from "@/lib/commands";
import { normalizeTauriError } from "@/lib/error-utils";
import { MetricsStatusBanner } from "@/components/metrics";

// Extended DeploymentInfo with metrics
type DeploymentInfoWithMetrics = DeploymentInfo & ResourceMetrics;

export function DeploymentList() {
  const { currentNamespace } = useClusterStore();
  const { hasAccess } = usePremiumFeature();

  // Use centralized pods with metrics hook
  const { data: podsWithMetrics, podStatus } = usePodsWithMetrics();

  // Query function that merges deployments with aggregated metrics
  const queryFn = async (): Promise<DeploymentInfoWithMetrics[]> => {
    try {
      const deployments = await commands.listDeployments({
        namespace: currentNamespace || null,
        labelSelector: null,
        fieldSelector: null,
        limit: null,
      });

      return attachAggregatedPodMetrics(
        deployments,
        podsWithMetrics,
        matchDeploymentPods
      );
    } catch (err) {
      throw new Error(normalizeTauriError(err));
    }
  };

  const columns = useMemo<ColumnDef<DeploymentInfoWithMetrics>[]>(
    () => [
      createNameColumn<DeploymentInfoWithMetrics>(`/${toPlural(ResourceType.Deployment)}`),
      createNamespaceColumn<DeploymentInfoWithMetrics>(),
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

  return (
    <div className="space-y-4">
      {hasAccess && podStatus?.status !== "available" && (
        <MetricsStatusBanner status={podStatus} />
      )}
      <ResourceList<DeploymentInfoWithMetrics>
        title="Deployments"
        queryKey={[
          toPlural(ResourceType.Deployment),
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
                    to={`/${toPlural(ResourceType.Deployment)}/${row.original.namespace}/${row.original.name}`}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Scale className="mr-2 h-4 w-4" />
                  Scale
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <RotateCw className="mr-2 h-4 w-4" />
                  Restart
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
        emptyStateLabel={toPlural(ResourceType.Deployment)}
        deleteConfig={{
          mutationFn: async (item) => {
            try {
              await commands.deleteDeployment(item.name, item.namespace);
            } catch (err) {
              throw new Error(normalizeTauriError(err));
            }
          },
          invalidateQueryKeys: [[toPlural(ResourceType.Deployment)]],
          resourceType: ResourceType.Deployment,
        }}
        staleTime={10000}
        refetchInterval={15000}
      />
    </div>
  );
}
