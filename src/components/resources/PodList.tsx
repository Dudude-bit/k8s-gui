import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye, Trash2, Terminal, FileText } from "lucide-react";
import { ResourceListHeader } from "@/components/resources/ResourceListHeader";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatAge, getStatusColor } from "@/lib/utils";
import { useMemo } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { usePodsWithMetrics, type PodWithMetrics } from "@/hooks/usePodsWithMetrics";
import { useResourceListDelete } from "@/hooks/useResourceListDelete";
import { ResourceUsage } from "@/components/ui/resource-usage";
import type { ContainerInfo } from "@/types/kubernetes";

// Helper to format ready containers count
function formatReady(containers: ContainerInfo[]): string {
  const ready = containers.filter((c) => c.ready).length;
  return `${ready}/${containers.length}`;
}

export function PodList() {
  const { isConnected } = useClusterStore();

  // Use centralized pods with metrics hook
  const { data: podsWithMetrics, isLoading, isFetching, refetch } = usePodsWithMetrics();

  // Setup delete functionality
  const { deleteTarget, setDeleteTarget, deleteMutation } = useResourceListDelete<PodWithMetrics>({
    mutationFn: async (item) => {
      await invoke("delete_pod", {
        name: item.name,
        namespace: item.namespace,
      });
    },
    invalidateQueryKey: ["pods"],
    successTitle: "Pod deleted",
    successDescription: "The pod has been deleted successfully.",
    errorPrefix: "Failed to delete pod",
  });

  const columns = useMemo<ColumnDef<PodWithMetrics>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to={`/pod/${row.original.namespace}/${row.original.name}`}
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
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge className={getStatusColor(row.original.status.phase)}>
            {row.original.status.phase}
          </Badge>
        ),
      },
      {
        id: "cpu",
        header: "CPU",
        cell: ({ row }) => (
          <ResourceUsage
            used={row.original.cpu_usage}
            total={row.original.cpu_limits ?? row.original.cpu_requests ?? null}
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
            total={row.original.memory_limits ?? row.original.memory_requests ?? null}
            type="memory"
            showProgressBar={false}
          />
        ),
      },
      {
        id: "ready",
        header: "Ready",
        cell: ({ row }) => formatReady(row.original.containers),
      },
      {
        id: "restarts",
        header: "Restarts",
        cell: ({ row }) => (
          <span className={row.original.restart_count > 5 ? "text-yellow-500" : ""}>
            {row.original.restart_count}
          </span>
        ),
      },
      {
        id: "node",
        header: "Node",
        cell: ({ row }) => row.original.node_name || "-",
      },
      {
        id: "ip",
        header: "IP",
        cell: ({ row }) => row.original.pod_ip || "-",
      },
      {
        id: "age",
        header: "Age",
        cell: ({ row }) => formatAge(row.original.created_at),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <ActionMenu>
            <DropdownMenuItem asChild>
              <Link to={`/pod/${row.original.namespace}/${row.original.name}`}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <FileText className="mr-2 h-4 w-4" />
              View Logs
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Terminal className="mr-2 h-4 w-4" />
              Shell
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
    ],
    [setDeleteTarget]
  );

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="pods" />;
  }

  const showSkeleton = isLoading && podsWithMetrics.length === 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <ResourceListHeader
        title="Pods"
        isFetching={isFetching}
        isLoading={isLoading}
        onRefresh={() => refetch()}
      />
      <DataTable
        columns={columns}
        data={podsWithMetrics}
        isLoading={showSkeleton}
        isFetching={isFetching && !isLoading}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title="Delete pod?"
        description={
          deleteTarget
            ? `This will delete ${deleteTarget.name} in ${deleteTarget.namespace}.`
            : undefined
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        confirmDisabled={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget);
          }
        }}
      />
    </div>
  );
}
