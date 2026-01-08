import { useClusterStore } from "@/stores/clusterStore";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye, Trash2, Terminal, FileText } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useMemo } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import {
  usePodsWithMetrics,
  type PodWithMetrics,
} from "@/hooks/usePodsWithMetrics";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricBadge } from "@/components/ui/metric-card";
import { parseCPU, parseMemory } from "@/lib/k8s-quantity";
import {
  createNameColumn,
  createNamespaceColumn,
  createAgeColumn,
} from "./columns";
import type { ContainerInfo } from "@/generated/types";
import * as commands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";
import { ResourceList } from "./ResourceList";
import { ResourceType, toPlural } from "@/lib/resource-types";
import { MetricsStatusBanner } from "@/components/metrics";

// Helper to format ready containers count
function formatReady(containers: ContainerInfo[]): string {
  const ready = containers.filter((c) => c.ready).length;
  return `${ready}/${containers.length}`;
}

export function PodList() {
  const { currentNamespace } = useClusterStore();
  const { hasAccess } = usePremiumFeature();
  const { data: podsWithMetrics, podStatus } = usePodsWithMetrics();

  // Wrap the data from the hook into a query function for ResourceList
  const queryFn = async (): Promise<PodWithMetrics[]> => {
    return podsWithMetrics;
  };

  const columns = useMemo<ColumnDef<PodWithMetrics>[]>(
    () => [
      createNameColumn<PodWithMetrics>(`/${toPlural(ResourceType.Pod)}`),
      createNamespaceColumn<PodWithMetrics>(),
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status.phase} />,
      },
      {
        id: "cpu",
        header: "CPU",
        cell: ({ row }) => (
          <MetricBadge
            used={row.original.cpuMillicores}
            total={
              row.original.cpuLimits
                ? parseCPU(row.original.cpuLimits)
                : row.original.cpuRequests
                  ? parseCPU(row.original.cpuRequests)
                  : null
            }
            type="cpu"
          />
        ),
      },
      {
        id: "memory",
        header: "Memory",
        cell: ({ row }) => (
          <MetricBadge
            used={row.original.memoryBytes}
            total={
              row.original.memoryLimits
                ? parseMemory(row.original.memoryLimits)
                : row.original.memoryRequests
                  ? parseMemory(row.original.memoryRequests)
                  : null
            }
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
          <span
            className={row.original.restartCount > 5 ? "text-yellow-500" : ""}
          >
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
    ],
    []
  );

  return (
    <div className="space-y-4">
      {hasAccess && podStatus?.status !== "available" && (
        <MetricsStatusBanner status={podStatus} />
      )}
      <ResourceList<PodWithMetrics>
        title="Pods"
        // We use the same query key structure but include podsWithMetrics length/content hash to force update
        // when the hook updates.
        queryKey={[
          `${toPlural(ResourceType.Pod)}-list-view`,
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
                    to={`/${toPlural(ResourceType.Pod)}/${row.original.namespace}/${row.original.name}`}
                  >
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
        ]}
        emptyStateLabel={toPlural(ResourceType.Pod)}
        deleteConfig={{
          mutationFn: async (item) => {
            try {
              await commands.deletePod(item.name, item.namespace, false);
            } catch (err) {
              throw new Error(normalizeTauriError(err));
            }
          },
          invalidateQueryKeys: [[toPlural(ResourceType.Pod)]],
          resourceType: ResourceType.Pod,
        }}
        staleTime={10000}
      />
    </div>
  );
}
