import { commands } from "@/lib/commands";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye, Trash2, ExternalLink } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useMemo } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { ResourceList } from "./ResourceList";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { getResourceDetailUrl, getResourceListUrl } from "@/lib/navigation-utils";
import type { ServiceInfo, ServicePortInfo } from "@/generated/types";
import { STALE_TIMES } from "@/lib/refresh";
import {
  createNameColumn,
  createNamespaceColumn,
  createAgeColumn,
  createTypeBadgeColumn,
} from "./columns";

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

  return (
    <ResourceList<ServiceInfo>
      title="Services"
      queryKey={[toPlural(ResourceType.Service), currentNamespace]}
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
      columns={(setDeleteTarget) => [
        ...columns,
        {
          id: "actions",
          cell: ({ row }) => (
            <ActionMenu>
              <DropdownMenuItem asChild>
                <Link
                  to={getResourceDetailUrl(ResourceType.Service, row.original.name, row.original.namespace)}
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
      emptyStateLabel={toPlural(ResourceType.Service)}
      getRowHref={(row) => getResourceDetailUrl(ResourceType.Service, row.name, row.namespace)}
      deleteConfig={{
        mutationFn: async (item) => {
          await commands.deleteService(item.name, item.namespace);
        },
        invalidateQueryKeys: [[toPlural(ResourceType.Service)]],
        resourceType: ResourceType.Service,
      }}
      staleTime={STALE_TIMES.resourceList}
    />
  );
}
