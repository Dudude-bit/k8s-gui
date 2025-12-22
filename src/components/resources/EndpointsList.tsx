import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, Network, CircleDot } from "lucide-react";
import { ResourceListHeader } from "@/components/resources/ResourceListHeader";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ActionMenu } from "@/components/ui/action-menu";

interface EndpointAddress {
  ip: string;
  hostname: string | null;
  node_name: string | null;
  target_ref: {
    kind: string;
    name: string;
    namespace: string;
  } | null;
}

interface EndpointPort {
  name: string | null;
  port: number;
  protocol: string;
}

interface EndpointSubset {
  addresses: EndpointAddress[];
  not_ready_addresses: EndpointAddress[];
  ports: EndpointPort[];
}

interface EndpointsInfo {
  name: string;
  namespace: string;
  subsets: EndpointSubset[];
  age: string;
}

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
        0,
      );
      const notReadyCount = row.original.subsets.reduce(
        (acc, s) => acc + s.not_ready_addresses.length,
        0,
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
                        {addr.target_ref &&
                          ` (${addr.target_ref.kind}/${addr.target_ref.name})`}
                      </div>
                    )),
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
                    s.not_ready_addresses.map((addr, i) => (
                      <div key={i}>
                        {addr.ip}
                        {addr.target_ref &&
                          ` (${addr.target_ref.kind}/${addr.target_ref.name})`}
                      </div>
                    )),
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
    cell: () => (
      <ActionMenu>
        <DropdownMenuItem>
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </DropdownMenuItem>
      </ActionMenu>
    ),
  },
];

export function EndpointsList() {
  const { isConnected, currentNamespace } = useClusterStore();

  const {
    data: endpoints = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["endpoints", currentNamespace],
    queryFn: async () => {
      const result = await invoke<EndpointsInfo[]>("list_endpoints", {
        namespace: currentNamespace,
      });
      return result;
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 10000,
    refetchOnWindowFocus: false,
  });

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="endpoints" />;
  }

  return (
    <div className="space-y-4">
      <ResourceListHeader
        title="Endpoints"
        description={`Network endpoints for services in ${currentNamespace || "all namespaces"}`}
        isFetching={isFetching}
        isLoading={isLoading}
        onRefresh={() => refetch()}
      />
      <DataTable
        columns={columns}
        data={endpoints}
        isLoading={isLoading && endpoints.length === 0}
        isFetching={isFetching && !isLoading}
        searchKey="name"
      />
    </div>
  );
}
