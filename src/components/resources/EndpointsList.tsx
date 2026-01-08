import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye, Network, CircleDot } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ActionMenu } from "@/components/ui/action-menu";
import { ResourceList } from "@/components/resources/ResourceList";
import { commands } from "@/lib/commands";

import type { EndpointsInfo } from "@/generated/types";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { STALE_TIMES } from "@/lib/refresh";

const columns: ColumnDef<EndpointsInfo>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{row.original.name}</span>
      </div>
    ),
  },
  {
    accessorKey: "namespace",
    header: "Namespace",
  },
  {
    id: "endpoints",
    header: "Endpoints",
    cell: ({ row }) => {
      const readyCount = row.original.subsets.reduce(
        (acc, s) => acc + s.addresses.length,
        0
      );
      const notReadyCount = row.original.subsets.reduce(
        (acc, s) => acc + s.notReadyAddresses.length,
        0
      );

      if (readyCount === 0 && notReadyCount === 0) {
        return <span className="text-muted-foreground">No endpoints</span>;
      }

      return (
        <div className="flex items-center gap-2">
          {readyCount > 0 && (
            <Tooltip>
              <TooltipTrigger>
                <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                  <CircleDot className="mr-1 h-3 w-3" />
                  {readyCount} ready
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1 text-xs">
                  {row.original.subsets.flatMap((s) =>
                    s.addresses.map((addr, i) => (
                      <div key={i}>
                        {addr.ip}
                        {addr.targetRef &&
                          ` (${addr.targetRef.kind}/${addr.targetRef.name})`}
                      </div>
                    ))
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          {notReadyCount > 0 && (
            <Tooltip>
              <TooltipTrigger>
                <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                  {notReadyCount} not ready
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1 text-xs">
                  {row.original.subsets.flatMap((s) =>
                    s.notReadyAddresses.map((addr, i) => (
                      <div key={i}>
                        {addr.ip}
                        {addr.targetRef &&
                          ` (${addr.targetRef.kind}/${addr.targetRef.name})`}
                      </div>
                    ))
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      );
    },
  },
  {
    id: "ports",
    header: "Ports",
    cell: ({ row }) => {
      const ports = row.original.subsets.flatMap((s) => s.ports);
      if (ports.length === 0) return "-";
      return (
        <div className="flex flex-wrap gap-1">
          {ports.slice(0, 3).map((port, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {port.name ? `${port.name}:` : ""}
              {port.port}/{port.protocol}
            </Badge>
          ))}
          {ports.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{ports.length - 3}
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    id: "addresses",
    header: "IPs",
    cell: ({ row }) => {
      const addresses = row.original.subsets.flatMap((s) => s.addresses);
      if (addresses.length === 0) {
        return <span className="text-muted-foreground">None</span>;
      }
      return (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline">{addresses.length} IP(s)</Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1 text-xs font-mono">
              {addresses.map((addr, i) => (
                <div key={i}>{addr.ip}</div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    accessorKey: "age",
    header: "Age",
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <ActionMenu>
        <DropdownMenuItem asChild>
          <Link
            to={`/${toPlural(ResourceType.Endpoints)}/${row.original.namespace}/${row.original.name}`}
          >
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </Link>
        </DropdownMenuItem>
      </ActionMenu>
    ),
  },
];

export function EndpointsList() {
  const { currentNamespace } = useClusterStore();

  return (
    <ResourceList<EndpointsInfo>
      title="Endpoints"
      description={`Network endpoints for services in ${currentNamespace || "all namespaces"}`}
      queryKey={[toPlural(ResourceType.Endpoints), currentNamespace]}
      queryFn={() =>
        commands.listEndpoints({
          namespace: currentNamespace || null,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
        })
      }
      columns={columns}
      emptyStateLabel={toPlural(ResourceType.Endpoints)}
      staleTime={STALE_TIMES.resourceList}
      searchKey="name"
    />
  );
}
