import * as commands from "@/generated/commands";
import { useClusterStore } from "@/stores/clusterStore";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, Trash2, Globe, ExternalLink } from "lucide-react";
import { useResourceList } from "@/hooks/useResource";
import { ResourceType, toPlural } from "@/lib/resource-types";
import { ResourceListHeader } from "@/components/resources/ResourceListHeader";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ActionMenu } from "@/components/ui/action-menu";

import type { IngressInfo } from "@/generated/types";

const getIngressOpenUrl = (ingress: IngressInfo): string | null => {
  const host =
    ingress.rules.find((rule) => rule.host && rule.host !== "*")?.host ||
    ingress.loadBalancerIps[0];

  if (!host) {
    return null;
  }

  const usesTls = ingress.tlsHosts.includes(host);
  const scheme = usesTls ? "https" : "http";
  return `${scheme}://${host}`;
};

const columns: ColumnDef<IngressInfo>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{row.original.name}</span>
      </div>
    ),
  },
  {
    accessorKey: "namespace",
    header: "Namespace",
  },
  {
    accessorKey: "className",
    header: "Class",
    cell: ({ row }) => row.original.className || "default",
  },
  {
    accessorKey: "rules",
    header: "Hosts",
    cell: ({ row }) => {
      const hosts = row.original.rules.map((r) => r.host).filter(Boolean);
      if (hosts.length === 0) return "*";
      return (
        <div className="flex flex-wrap gap-1">
          {hosts.slice(0, 2).map((host, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {host}
            </Badge>
          ))}
          {hosts.length > 2 && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="secondary" className="text-xs">
                  +{hosts.length - 2}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {hosts.slice(2).map((host, i) => (
                  <div key={i}>{host}</div>
                ))}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      );
    },
  },
  {
    id: "paths",
    header: "Paths",
    cell: ({ row }) => {
      const allPaths = row.original.rules.flatMap((r) => r.paths);
      if (allPaths.length === 0) return "-";
      return (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="secondary">{allPaths.length} path(s)</Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1 text-xs">
              {allPaths.map((p, i) => (
                <div key={i}>
                  {p.path} → {p.backendService}:{p.backendPort}
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    accessorKey: "loadBalancerIps",
    header: "Address",
    cell: ({ row }) => {
      const ips = row.original.loadBalancerIps;
      if (ips.length === 0)
        return <span className="text-muted-foreground">Pending</span>;
      return (
        <div className="flex items-center gap-1">
          <span className="text-xs">{ips[0]}</span>
          {ips.length > 1 && (
            <Badge variant="secondary" className="text-xs">
              +{ips.length - 1}
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "tlsHosts",
    header: "TLS",
    cell: ({ row }) => {
      const tlsHosts = row.original.tlsHosts;
      if (tlsHosts.length === 0) {
        return <Badge variant="outline">No TLS</Badge>;
      }
      return (
        <Tooltip>
          <TooltipTrigger>
            <Badge
              variant="default"
              className="bg-green-500/10 text-green-500 border-green-500/20"
            >
              TLS ({tlsHosts.length})
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              {tlsHosts.map((host, i) => (
                <div key={i} className="text-xs">
                  {host}
                </div>
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
    cell: ({ row }) => {
      const openUrl = getIngressOpenUrl(row.original);
      return (
        <ActionMenu>
          <DropdownMenuItem>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
          {openUrl && (
            <DropdownMenuItem
              onClick={() => window.open(openUrl, "_blank", "noreferrer")}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in Browser
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </ActionMenu>
      );
    },
  },
];

export function IngressList() {
  const { isConnected, currentNamespace } = useClusterStore();

  const {
    data: ingresses = [],
    isLoading,
    isFetching,
    refetch,
  } = useResourceList(
    [toPlural(ResourceType.Ingress), currentNamespace],
    async () => {
      return await commands.listIngresses({
        namespace: currentNamespace ?? null,
        labelSelector: null,
        fieldSelector: null,
        limit: null,
      });
    },
    { enabled: isConnected }
  );

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel={toPlural(ResourceType.Ingress)} />;
  }

  return (
    <div className="space-y-4">
      <ResourceListHeader
        title="Ingresses"
        description="HTTP/HTTPS routing rules for external access to services"
        isFetching={isFetching}
        isLoading={isLoading}
        onRefresh={() => refetch()}
      />
      <DataTable
        columns={columns}
        data={ingresses}
        isLoading={isLoading && ingresses.length === 0}
        isFetching={isFetching && !isLoading}
        searchKey="name"
      />
    </div>
  );
}
