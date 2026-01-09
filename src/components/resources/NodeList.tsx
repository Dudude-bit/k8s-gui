import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye, Shield, ShieldOff, AlertTriangle, Lock } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { ActionMenu } from "@/components/ui/action-menu";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import { MetricBadge } from "@/components/ui/metric-card";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { useMemo } from "react";
import { commands } from "@/lib/commands";
import { useMetrics } from "@/hooks/useMetrics";
import { parseCPU, parseMemory } from "@/lib/k8s-quantity";
import { MetricsStatusBanner } from "@/components/metrics";
import { ResourceList } from "@/components/resources/ResourceList";
import type { NodeInfo } from "@/generated/types";
import { REFRESH_INTERVALS, STALE_TIMES } from "@/lib/refresh";
import { RealtimeAge } from "@/components/ui/realtime";

export function NodeList() {
  const { isConnected } = useClusterStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasAccess } = usePremiumFeature();

  const { nodeMetrics, nodeStatus } = useMetrics({
    includePods: false,
    includeCluster: false,
    enabled: isConnected,
  });

  const nodeMetricsByName = useMemo(() => {
    const metricsMap = new Map<string, typeof nodeMetrics[number]>();
    for (const metric of nodeMetrics) {
      metricsMap.set(metric.name, metric);
    }
    return metricsMap;
  }, [nodeMetrics]);

  const cordonMutation = useMutation({
    mutationFn: (nodeName: string) => commands.cordonNode(nodeName),
    onSuccess: (_, nodeName) => {
      queryClient.invalidateQueries({ queryKey: [toPlural(ResourceType.Node)] });
      toast({
        title: "Node cordoned",
        description: `Node ${nodeName} has been cordoned.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to cordon node: ${error}`,
        variant: "destructive",
      });
    },
  });

  const uncordonMutation = useMutation({
    mutationFn: (nodeName: string) => commands.uncordonNode(nodeName),
    onSuccess: (_, nodeName) => {
      queryClient.invalidateQueries({ queryKey: [toPlural(ResourceType.Node)] });
      toast({
        title: "Node uncordoned",
        description: `Node ${nodeName} has been uncordoned.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to uncordon node: ${error}`,
        variant: "destructive",
      });
    },
  });

  const drainMutation = useMutation({
    mutationFn: (nodeName: string) => commands.drainNode(nodeName, true, true),
    onSuccess: (_, nodeName) => {
      queryClient.invalidateQueries({ queryKey: [toPlural(ResourceType.Node)] });
      toast({
        title: "Node drained",
        description: `Node ${nodeName} has been drained.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to drain node: ${error}`,
        variant: "destructive",
      });
    },
  });

  const columns: ColumnDef<NodeInfo>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const ready = row.original.status.ready;
          return <StatusBadge status={ready ? "Ready" : "NotReady"} />;
        },
      },
      {
        accessorKey: "roles",
        header: "Roles",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((role) => (
              <Badge key={role} variant="outline" className="text-xs">
                {role}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: "version",
        header: "Version",
      },
      {
        id: "internal_ip",
        header: "Internal IP",
        cell: ({ row }) => {
          const address = row.original.status.addresses.find(
            (a) => a.type === "InternalIP"
          );
          return address?.address || "-";
        },
      },
      {
        id: "cpu",
        header: "CPU Usage",
        cell: ({ row }) => {
          if (!hasAccess) {
            return (
              <Badge variant="outline" className="gap-1 text-xs">
                <Lock className="h-3 w-3" />
                Premium
              </Badge>
            );
          }
          const metrics = nodeMetricsByName.get(row.original.name);
          const capacity = row.original.capacity
            ? row.original.capacity.cpu
            : null;
          return (
            <MetricBadge
              used={metrics?.cpuMillicores ?? null}
              total={capacity ? parseCPU(capacity) : null}
              type="cpu"
            />
          );
        },
      },
      {
        id: "memory",
        header: "Memory Usage",
        cell: ({ row }) => {
          if (!hasAccess) {
            return (
              <Badge variant="outline" className="gap-1 text-xs">
                <Lock className="h-3 w-3" />
                Premium
              </Badge>
            );
          }
          const metrics = nodeMetricsByName.get(row.original.name);
          const capacity = row.original.capacity
            ? row.original.capacity.memory
            : null;
          return (
            <MetricBadge
              used={metrics?.memoryBytes ?? null}
              total={capacity ? parseMemory(capacity) : null}
              type="memory"
            />
          );
        },
      },
      {
        id: "capacity_pods",
        header: "Pod Cap",
        cell: ({ row }) => row.original.capacity?.pods || "-",
      },
      {
        id: "age",
        header: "Age",
        cell: ({ row }) => <RealtimeAge timestamp={row.original.createdAt} />,
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <ActionMenu>
            <DropdownMenuItem asChild>
              <Link to={getResourceDetailUrl(ResourceType.Node, row.original.name)}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Note: Simplified check as 'isSchedulable' might not be directly exposed or named differently in generated types if it was a computed field. 
              Usually untainted nodes are schedulable or check Ready condition. 
              The manual type had 'is_schedulable'. The generated one has 'taints'. 
          */}
            <DropdownMenuItem
              onClick={() => cordonMutation.mutate(row.original.name)}
            >
              <ShieldOff className="mr-2 h-4 w-4" />
              Cordon
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => uncordonMutation.mutate(row.original.name)}
            >
              <Shield className="mr-2 h-4 w-4" />
              Uncordon
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => drainMutation.mutate(row.original.name)}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Drain
            </DropdownMenuItem>
          </ActionMenu>
        ),
      },
    ],
    [
      cordonMutation,
      uncordonMutation,
      drainMutation,
      hasAccess,
      nodeMetricsByName,
    ]
  );

  return (
    <ResourceList<NodeInfo>
      title="Nodes"
      queryKey={[toPlural(ResourceType.Node)]}
      queryFn={() => commands.listNodes(null)}
      columns={columns}
      emptyStateLabel={toPlural(ResourceType.Node)}
      staleTime={STALE_TIMES.resourceList}
      refetchInterval={REFRESH_INTERVALS.resourceList}
      headerContent={
        hasAccess && nodeStatus?.status !== "available" ? (
          <MetricsStatusBanner status={nodeStatus} />
        ) : null
      }
      getRowHref={(row) => getResourceDetailUrl(ResourceType.Node, row.name)}
    />
  );
}
