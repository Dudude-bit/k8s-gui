import { useClusterStore } from "@/stores/clusterStore";
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
import { useMemo } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { usePodsWithMetrics, type PodWithMetrics } from "@/hooks/usePodsWithMetrics";
import { useResourceDelete } from "@/hooks/useResource";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricBadge } from "@/components/ui/metric-card";
import {
  createNameColumn,
  createNamespaceColumn,
  createAgeColumn,
} from "./columns";
import type { ContainerInfo } from "@/generated/types";
import * as commands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";

// Helper to format ready containers count
function formatReady(containers: ContainerInfo[]): string {
  const ready = containers.filter((c) => c.ready).length;
  return `${ready}/${containers.length}`;
}

export function PodList() {
  const { isConnected } = useClusterStore();

  // Use centralized pods with metrics hook
  const { data: podsWithMetrics, isLoading, isFetching, refetch } = usePodsWithMetrics();

  // Setup delete functionality with new hook
  const { deleteTarget, setDeleteTarget, confirmDelete, isDeleting } = useResourceDelete<PodWithMetrics>({
    mutationFn: async (item) => {
      try {
        await commands.deletePod(item.name, item.namespace, false);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    invalidateQueryKeys: [["pods"]],
    resourceType: "Pod",
  });

  const columns = useMemo<ColumnDef<PodWithMetrics>[]>(
    () => [
      createNameColumn<PodWithMetrics>("/pod"),
      createNamespaceColumn<PodWithMetrics>(),
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge status={row.original.status.phase} />
        ),
      },
      {
        id: "cpu",
        header: "CPU",
        cell: ({ row }) => (
          <MetricBadge
            used={row.original.cpuUsage}
            total={row.original.cpuLimits ?? row.original.cpuRequests}
            type="cpu"
          />
        ),
      },
      {
        id: "memory",
        header: "Memory",
        cell: ({ row }) => (
          <MetricBadge
            used={row.original.memoryUsage}
            total={row.original.memoryLimits ?? row.original.memoryRequests}
            type="memory"
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
          <span className={row.original.restartCount > 5 ? "text-yellow-500" : ""}>
            {row.original.restartCount}
          </span>
        ),
      },
      {
        id: "node",
        header: "Node",
        cell: ({ row }) => row.original.nodeName || "-",
      },
      {
        id: "ip",
        header: "IP",
        cell: ({ row }) => row.original.podIp || "-",
      },
      createAgeColumn<PodWithMetrics>(),
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
        confirmDisabled={isDeleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
