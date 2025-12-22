import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye, Trash2, RotateCw, Scale } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatAge, getStatusColor } from "@/lib/utils";
import { useMemo } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { ResourceList } from "./ResourceList";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { ResourceUsage } from "@/components/ui/resource-usage";
import { aggregatePodMetrics } from "@/lib/resource-utils";
import type { DeploymentInfo } from "@/types/kubernetes";

// Extended DeploymentInfo with metrics
type DeploymentInfoWithMetrics = DeploymentInfo & {
  cpu_usage: string | null;
  memory_usage: string | null;
};

export function DeploymentList() {
  const { currentNamespace } = useClusterStore();

  // Use centralized pods with metrics hook
  const { data: podsWithMetrics } = usePodsWithMetrics();

  // Query function that merges deployments with aggregated metrics
  const queryFn = async (): Promise<DeploymentInfoWithMetrics[]> => {
    const deployments = await invoke<DeploymentInfo[]>("list_deployments", {
      filters: { namespace: currentNamespace },
    });

    // Aggregate metrics per deployment
    return deployments.map((deployment) => {
      const deploymentPods = podsWithMetrics.filter((pod) => {
        const podLabels = pod.labels || {};
        const deploymentLabels = deployment.labels || {};
        
        return (
          pod.namespace === deployment.namespace &&
          (podLabels["app"] === deploymentLabels["app"] ||
            podLabels["deployment"] === deployment.name ||
            pod.name.startsWith(deployment.name + "-"))
        );
      });

      const aggregated = aggregatePodMetrics(deploymentPods);

      return {
        ...deployment,
        cpu_usage: aggregated.cpu_usage,
        memory_usage: aggregated.memory_usage,
      };
    });
  };

  const columns = useMemo<ColumnDef<DeploymentInfoWithMetrics>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to={`/deployment/${row.original.namespace}/${row.original.name}`}
            className="font-medium hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "namespace",
        header: "Namespace",
      },
      {
        id: "cpu",
        header: "CPU",
        cell: ({ row }) => (
          <ResourceUsage
            used={row.original.cpu_usage}
            total={null}
            type="cpu"
            showProgressBar={false}
          />
        ),
      },
      {
        id: "memory",
        header: "Memory",
        cell: ({ row }) => (
          <ResourceUsage
            used={row.original.memory_usage}
            total={null}
            type="memory"
            showProgressBar={false}
          />
        ),
      },
      {
        id: "replicas",
        header: "Replicas",
        cell: ({ row }) => {
          const ready = row.original.replicas.ready || 0;
          const total = row.original.replicas.desired;
          const isHealthy = ready === total;
          return (
            <span className={isHealthy ? "text-green-500" : "text-yellow-500"}>
              {ready}/{total}
            </span>
          );
        },
      },
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
          return <Badge className={getStatusColor(status)}>{status}</Badge>;
        },
      },
      {
        id: "age",
        header: "Age",
        cell: ({ row }) => formatAge(row.original.created_at),
      },
    ],
    []
  );

  return (
    <ResourceList<DeploymentInfoWithMetrics>
      title="Deployments"
      queryKey={["deployments", currentNamespace, JSON.stringify(podsWithMetrics.map(p => p.name))]}
      queryFn={queryFn}
      columns={(setDeleteTarget) => [
        ...columns,
        {
          id: "actions",
          cell: ({ row }) => (
            <ActionMenu>
              <DropdownMenuItem asChild>
                <Link
                  to={`/deployment/${row.original.namespace}/${row.original.name}`}
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
      emptyStateLabel="deployments"
      deleteConfig={{
        mutationFn: async (item) => {
          await invoke("delete_deployment", {
            name: item.name,
            namespace: item.namespace,
          });
        },
        invalidateQueryKey: ["deployments"],
        successTitle: "Deployment deleted",
        successDescription: "The deployment has been deleted successfully.",
        errorPrefix: "Failed to delete deployment",
      }}
      staleTime={10000}
      refetchInterval={15000}
    />
  );
}
