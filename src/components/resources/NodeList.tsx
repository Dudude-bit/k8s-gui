import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { useClusterStore } from "@/stores/clusterStore";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye, Shield, ShieldOff, AlertTriangle, Lock } from "lucide-react";
import { ResourceListHeader } from "@/components/resources/ResourceListHeader";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { ActionMenu } from "@/components/ui/action-menu";
import { ResourceType, toPlural } from "@/lib/resource-types";
import { MetricBadge } from "@/components/ui/metric-card";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { useMemo } from "react";
import * as commands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";
import { formatAge } from "@/lib/utils";
import { useMetrics } from "@/hooks/useMetrics";
import { mergeNodesWithMetrics, type NodeWithMetrics } from "@/lib/metrics";
import { parseCPU, parseMemory } from "@/lib/k8s-quantity";
import { MetricsStatusBanner } from "@/components/metrics";

export function NodeList() {
  const { isConnected } = useClusterStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasAccess } = usePremiumFeature();

  const {
    data: nodes = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: [toPlural(ResourceType.Node)],
    queryFn: async () => {
      try {
        return await commands.listNodes(null);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 10000,
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
  });

  const { nodeMetrics, nodeStatus } = useMetrics({
    includePods: false,
    includeCluster: false,
    enabled: isConnected,
  });

  // Merge nodes with metrics
  const nodesWithMetrics = useMemo(() => {
    return mergeNodesWithMetrics(nodes, nodeMetrics);
  }, [nodes, nodeMetrics]);

  const cordonMutation = useMutation({
    mutationFn: async (nodeName: string) => {
      try {
        await commands.cordonNode(nodeName);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
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
    mutationFn: async (nodeName: string) => {
      try {
        await commands.uncordonNode(nodeName);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
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
    mutationFn: async (nodeName: string) => {
      try {
        await commands.drainNode(nodeName, true, true);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
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

  const columns: ColumnDef<NodeWithMetrics>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to={`/${toPlural(ResourceType.Node)}/${row.original.name}`}
            className="font-medium hover:underline flex items-center gap-2"
          >
            {row.original.name}
          </Link>
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
          const capacity = row.original.capacity
            ? row.original.capacity.cpu
            : null;
          return (
            <MetricBadge
              used={row.original.cpuMillicores}
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
          const capacity = row.original.capacity
            ? row.original.capacity.memory
            : null;
          return (
            <MetricBadge
              used={row.original.memoryBytes}
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
        cell: ({ row }) => formatAge(row.original.createdAt),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <ActionMenu>
            <DropdownMenuItem asChild>
              <Link to={`/${toPlural(ResourceType.Node)}/${row.original.name}`}>
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
    [cordonMutation, uncordonMutation, drainMutation, hasAccess]
  );

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel={toPlural(ResourceType.Node)} />;
  }

  return (
    <div className="h-full space-y-4">
      <ResourceListHeader
        title="Nodes"
        isFetching={isFetching}
        isLoading={isLoading}
        onRefresh={() => refetch()}
      />
      {hasAccess && nodeStatus?.status !== "available" && (
        <MetricsStatusBanner status={nodeStatus} />
      )}
      <DataTable
        columns={columns}
        data={nodesWithMetrics}
        isLoading={isLoading && nodes.length === 0}
        isFetching={isFetching && !isLoading}
      />
    </div>
  );
}
