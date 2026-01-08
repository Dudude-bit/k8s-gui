import { commands } from "@/lib/commands";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye, Trash2, Globe, ExternalLink } from "lucide-react";
import { ResourceType, toPlural } from "@/lib/resource-registry";
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
import { ResourceList } from "@/components/resources/ResourceList";

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
];

export function IngressList() {
  const { currentNamespace } = useClusterStore();

  return (
    <ResourceList<IngressInfo>
      title="Ingresses"
      queryKey={[toPlural(ResourceType.Ingress), currentNamespace]}
      queryFn={() =>
        commands.listIngresses({
          namespace: currentNamespace || null,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
        })
      }
      columns={(setDeleteTarget) => [
        ...baseColumns,
        {
          id: "actions",
          cell: ({ row }) => {
            const openUrl = getIngressOpenUrl(row.original);
            return (
              <ActionMenu>
                <DropdownMenuItem asChild>
                  <Link
                    to={`/${toPlural(ResourceType.Ingress)}/${row.original.namespace}/${row.original.name}`}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </Link>
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
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setDeleteTarget(row.original)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </ActionMenu>
            );
          },
        },
      ]}
      emptyStateLabel={toPlural(ResourceType.Ingress)}
      deleteConfig={{
        mutationFn: (item) =>
          commands.deleteIngress(item.name, item.namespace ?? null),
        invalidateQueryKeys: [[toPlural(ResourceType.Ingress)]],
        resourceType: ResourceType.Ingress,
      }}
      staleTime={10000}
      searchKey="name"
    />
  );
}
