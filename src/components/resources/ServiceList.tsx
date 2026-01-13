import { commands } from "@/lib/commands";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, Trash2, ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { ResourceList } from "./ResourceList";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { queryKeys } from "@/lib/query-keys";
import { getResourceDetailUrl, getResourceListUrl } from "@/lib/navigation-utils";
import type { ServiceInfo, ServicePortInfo } from "@/generated/types";
import { STALE_TIMES } from "@/lib/refresh";
import {
  createNameColumn,
  createNamespaceColumn,
  createAgeColumn,
  createTypeBadgeColumn,
} from "./columns";
import { getResourceRowId } from "@/lib/table-utils";
import type { QuickAction } from "@/components/ui/quick-actions";
import { useNavigate } from "react-router-dom";

// Format port for display
function formatPort(port: ServicePortInfo): string {
  const parts = [String(port.port)];
  if (port.nodePort) {
    parts.push(`:${port.nodePort}`);
  }
  if (port.targetPort) {
    parts.push(`>${port.targetPort}`);
  }
  parts.push(`/${port.protocol}`);
  return parts.join("");
}

export function ServiceList() {
  const { currentNamespace } = useClusterStore();
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<ServiceInfo>[]>(
    () => [
      createNameColumn<ServiceInfo>(getResourceListUrl(ResourceType.Service)),
      createNamespaceColumn<ServiceInfo>(),
      createTypeBadgeColumn<ServiceInfo>(),
      {
        accessorKey: "clusterIp",
        header: "Cluster IP",
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.clusterIp}</span>
        ),
      },
      {
        accessorKey: "externalIps",
        header: "External IPs",
        cell: ({ row }) => {
          const ips = row.original.externalIps;
          if (!ips || ips.length === 0)
            return <span className="text-muted-foreground">-</span>;
          return (
            <div className="flex flex-col gap-1">
              {ips.map((ip, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 font-mono text-xs"
                >
                  <ExternalLink className="h-3 w-3" />
                  {ip}
                </div>
              ))}
            </div>
          );
        },
      },
      {
        id: "ports",
        header: "Ports",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.ports.map((port, i) => (
              <Badge key={i} variant="outline" className="font-mono text-xs">
                {formatPort(port)}
              </Badge>
            ))}
          </div>
        ),
      },
      createAgeColumn<ServiceInfo>(),
    ],
    []
  );

  const quickActions = useMemo<(setDeleteTarget: (item: ServiceInfo) => void) => QuickAction<ServiceInfo>[]>(
    () => (setDeleteTarget) => [
      {
        icon: Eye,
        label: "View Details",
        onClick: (item) => navigate(getResourceDetailUrl(ResourceType.Service, item.name, item.namespace)),
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
    <ResourceList<ServiceInfo>
      title="Services"
      queryKey={queryKeys.resources(ResourceType.Service, currentNamespace)}
      getRowId={getResourceRowId}
      queryFn={async () => {
        const result = await commands.listServices({
          namespace: currentNamespace,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
          serviceType: null,
        });
        return result;
      }}
      columns={columns}
      quickActions={quickActions}
      emptyStateLabel={toPlural(ResourceType.Service)}
      getRowHref={(row) => getResourceDetailUrl(ResourceType.Service, row.name, row.namespace)}
      deleteConfig={{
        mutationFn: async (item) => {
          await commands.deleteService(item.name, item.namespace);
        },
        invalidateQueryKeys: [queryKeys.resources(ResourceType.Service, currentNamespace)],
        resourceType: ResourceType.Service,
      }}
      staleTime={STALE_TIMES.resourceList}
    />
  );
}
