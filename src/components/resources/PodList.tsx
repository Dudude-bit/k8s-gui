import { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "react-router-dom";
import { Eye, Trash2, Terminal, FileText } from "lucide-react";
import { useMemo } from "react";
import {
  usePodsWithMetrics,
  type PodWithMetrics,
} from "@/hooks/usePodsWithMetrics";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { StatusBadge } from "@/components/ui/status-badge";
import { NodeBadge } from "@/components/ui/node-badge";
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
import { queryKeys } from "@/lib/query-keys";
import { getResourceDetailUrl, getResourceListUrl } from "@/lib/navigation-utils";
import { MetricsStatusBanner } from "@/components/metrics";
import { getResourceRowId } from "@/lib/table-utils";
import type { QuickAction } from "@/components/ui/quick-actions";

// Helper to format ready containers count
function formatReady(containers: ContainerInfo[]): string {
  const ready = containers.filter((c) => c.ready).length;
  return `${ready}/${containers.length}`;
}

export function PodList() {
  const { hasAccess } = usePremiumFeature();
  const navigate = useNavigate();
  const {
    data: podsWithMetrics,
    podStatus,
    isLoading,
    dataUpdatedAt,
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
        cell: ({ row }) =>
          row.original.nodeName ? (
            <NodeBadge nodeName={row.original.nodeName} />
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
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

  const quickActions = useMemo<(setDeleteTarget: (item: PodWithMetrics) => void) => QuickAction<PodWithMetrics>[]>(
    () => (setDeleteTarget) => [
      {
        icon: Eye,
        label: "View Details",
        onClick: (item) => navigate(getResourceDetailUrl(ResourceType.Pod, item.name, item.namespace)),
      },
      {
        icon: FileText,
        label: "View Logs",
        onClick: (item) => navigate(`${getResourceDetailUrl(ResourceType.Pod, item.name, item.namespace)}?tab=logs`),
      },
      {
        icon: Terminal,
        label: "Shell",
        onClick: (item) => navigate(`${getResourceDetailUrl(ResourceType.Pod, item.name, item.namespace)}?tab=terminal`),
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
      <ResourceList<PodWithMetrics>
        title="Pods"
        data={podsWithMetrics}
        isLoading={isLoading}
        dataUpdatedAt={dataUpdatedAt}
        getRowId={getResourceRowId}
        columns={columns}
        quickActions={quickActions}
        emptyStateLabel={toPlural(ResourceType.Pod)}
        getRowHref={(row) => getResourceDetailUrl(ResourceType.Pod, row.name, row.namespace)}
        deleteConfig={{
          mutationFn: (item) => commands.deletePod(item.name, item.namespace, false),
          invalidateQueryKeys: [queryKeys.pods()],
          resourceType: ResourceType.Pod,
        }}
      />
    </div>
  );
}
