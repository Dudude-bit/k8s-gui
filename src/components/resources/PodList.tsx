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
import {
  createNameColumn,
  createNamespaceColumn,
  createAgeColumn,
  createCpuColumn,
  createMemoryColumn,
} from "./columns";
import type { ContainerInfo } from "@/generated/types";
import { commands } from "@/lib/commands";
import { ResourceList } from "./ResourceList";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { getResourceDetailUrl, getResourceListUrl } from "@/lib/navigation-utils";
import { MetricsStatusBanner } from "@/components/metrics";
import { getResourceRowId } from "@/lib/table-utils";

// Helper to format ready containers count
function formatReady(containers: ContainerInfo[]): string {
  const ready = containers.filter((c) => c.ready).length;
  return `${ready}/${containers.length}`;
}

export function PodList() {
  const { hasAccess } = usePremiumFeature();
  const {
    data: podsWithMetrics,
    podStatus,
    isLoading,
  } = usePodsWithMetrics();

  const columns = useMemo<ColumnDef<PodWithMetrics>[]>(
    () => [
      // Use disableLink since row is clickable
      createNameColumn<PodWithMetrics>(getResourceListUrl(ResourceType.Pod)),
      createNamespaceColumn<PodWithMetrics>(),
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status.phase} />,
      },
      createCpuColumn<PodWithMetrics>(),
      createMemoryColumn<PodWithMetrics>(),
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
        data={podsWithMetrics}
        isLoading={isLoading}
        getRowId={getResourceRowId}
        columns={(setDeleteTarget) => [
          ...columns,
          {
            id: "actions",
            cell: ({ row }) => (
              <ActionMenu>
                <DropdownMenuItem asChild>
                  <Link
                    to={getResourceDetailUrl(ResourceType.Pod, row.original.name, row.original.namespace)}
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
        getRowHref={(row) => getResourceDetailUrl(ResourceType.Pod, row.name, row.namespace)}
        deleteConfig={{
          mutationFn: (item) => commands.deletePod(item.name, item.namespace, false),
          invalidateQueryKeys: [[toPlural(ResourceType.Pod)]],
          resourceType: ResourceType.Pod,
        }}
      />
    </div>
  );
}
