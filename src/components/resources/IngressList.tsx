import { commands } from "@/lib/commands";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Trash2, Globe, ExternalLink } from "lucide-react";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { queryKeys } from "@/lib/query-keys";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ResourceList } from "@/components/resources/ResourceList";
import { createNamespaceColumn, createAgeColumn } from "@/components/resources/columns";
import type { QuickAction } from "@/components/ui/quick-actions";
import { TlsBadge } from "@/components/network";

import type { IngressInfo } from "@/generated/types";
import { STALE_TIMES } from "@/lib/refresh";
import { getResourceRowId } from "@/lib/table-utils";



const getIngressOpenUrl = (ingress: IngressInfo): string | null => {
  const host =
    ingress.rules.find((rule) => rule.host && rule.host !== "*")?.host ||
    ingress.loadBalancerIps[0];

  if (!host) {
    return null;
  }

  // Check both explicit TLS hosts and catch-all TLS
  const usesTls = ingress.tlsHosts.includes(host) || ingress.hasCatchAllTls;
  const scheme = usesTls ? "https" : "http";
  return `${scheme}://${host}`;
};

const baseColumns: ColumnDef<IngressInfo>[] = [
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
  createNamespaceColumn<IngressInfo>(),
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
    cell: ({ row }) => (
      <TlsBadge
        tlsHosts={row.original.tlsHosts}
        hasCatchAllTls={row.original.hasCatchAllTls}
      />
    ),
  },
  createAgeColumn<IngressInfo>(),
];

export function IngressList() {
  const { currentNamespace } = useClusterStore();
  const navigate = useNavigate();

  const quickActions = useMemo<(setDeleteTarget: (item: IngressInfo) => void) => QuickAction<IngressInfo>[]>(
    () => (setDeleteTarget) => [
      {
        icon: Eye,
        label: "View Details",
        onClick: (item) => navigate(getResourceDetailUrl(ResourceType.Ingress, item.name, item.namespace)),
      },
      {
        icon: ExternalLink,
        label: "Open in Browser",
        onClick: (item) => {
          const url = getIngressOpenUrl(item);
          if (url) window.open(url, "_blank", "noreferrer");
        },
        hidden: (item) => !getIngressOpenUrl(item),
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
    <ResourceList<IngressInfo>
      title="Ingresses"
      queryKey={queryKeys.resources(ResourceType.Ingress, currentNamespace)}
      getRowId={getResourceRowId}
      queryFn={() =>
        commands.listIngresses({
          namespace: currentNamespace || null,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
        })
      }
      columns={baseColumns}
      quickActions={quickActions}
      emptyStateLabel={toPlural(ResourceType.Ingress)}
      deleteConfig={{
        mutationFn: (item) =>
          commands.deleteIngress(item.name, item.namespace ?? null),
        invalidateQueryKeys: [queryKeys.resources(ResourceType.Ingress, currentNamespace)],
        resourceType: ResourceType.Ingress,
      }}
      staleTime={STALE_TIMES.resourceList}
      searchKey="name"
      getRowHref={(row) => getResourceDetailUrl(ResourceType.Ingress, row.name, row.namespace)}
    />
  );
}
