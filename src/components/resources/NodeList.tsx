import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye, Shield, ShieldOff, AlertTriangle } from "lucide-react";
import { ResourceListHeader } from "@/components/resources/ResourceListHeader";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { ActionMenu } from "@/components/ui/action-menu";
import { useNodeMetrics } from "@/hooks/useNodeMetrics";
import { ResourceUsage } from "@/components/ui/resource-usage";
import { useMemo } from "react";
import type { NodeInfo } from "@/types/kubernetes";

// Using NodeInfo from types/kubernetes.ts

const getNodeStatusColor = (
  status: string,
): "success" | "warning" | "destructive" | "secondary" => {
  if (status === "Ready") return "success";
  if (status === "NotReady") return "destructive";
  return "warning";
};

export function NodeList() {
  const { isConnected } = useClusterStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: nodes = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["nodes"],
    queryFn: async () => {
      const result = await invoke<NodeInfo[]>("list_nodes");
      return result;
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 10000,
    refetchInterval: 15000, // 15 seconds for main list
    refetchOnWindowFocus: false,
  });

  // Get node metrics separately for real-time updates
  const { data: nodeMetrics = [] } = useNodeMetrics();

  // Merge nodes with metrics
  const nodesWithMetrics = useMemo(() => {
    return nodes.map((node) => {
      const metrics = nodeMetrics.find((m) => m.name === node.name);
      return {
        ...node,
        cpu_usage: metrics?.cpu_usage ?? node.cpu_usage ?? null,
        memory_usage: metrics?.memory_usage ?? node.memory_usage ?? null,
      };
    });
  }, [nodes, nodeMetrics]);

  const cordonMutation = useMutation({
    mutationFn: async (nodeName: string) => {
      await invoke("cordon_node", { name: nodeName });
    },
    onSuccess: (_, nodeName) => {
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
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
      await invoke("uncordon_node", { name: nodeName });
    },
    onSuccess: (_, nodeName) => {
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
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
      await invoke("drain_node", {
        name: nodeName,
        ignoreDaemonsets: true,
        deleteEmptydir: true,
      });
    },
    onSuccess: (_, nodeName) => {
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
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

  const columns: ColumnDef<NodeInfo>[] = useMemo(() => [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <Link
          to={`/node/${row.original.name}`}
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
        const status = row.original.status;
        return <Badge variant={getNodeStatusColor(status)}>{status}</Badge>;
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
        return row.original.internal_ip || "-";
      },
    },
    {
      id: "cpu",
      header: "CPU Usage",
      cell: ({ row }) => {
        const node = nodesWithMetrics.find((n) => n.name === row.original.name);
        const capacity = node?.cpu_capacity || null;
        return (
          <ResourceUsage
            used={node?.cpu_usage ?? null}
            total={capacity}
            type="cpu"
            showProgressBar={false}
          />
        );
      },
    },
    {
      id: "memory",
      header: "Memory Usage",
      cell: ({ row }) => {
        const node = nodesWithMetrics.find((n) => n.name === row.original.name);
        const capacity = node?.memory_capacity || null;
        return (
          <ResourceUsage
            used={node?.memory_usage ?? null}
            total={capacity}
            type="memory"
            showProgressBar={false}
          />
        );
      },
    },
    {
      id: "pod_count",
      header: "Pods",
      cell: ({ row }) => row.original.pod_count || "-",
    },
    {
      id: "age",
      header: "Age",
      cell: ({ row }) => row.original.age || "-",
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <ActionMenu>
          <DropdownMenuItem asChild>
            <Link to={`/node/${row.original.name}`}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {((row.original as any).is_schedulable !== false) ? (
            <DropdownMenuItem
              onClick={() => cordonMutation.mutate(row.original.name)}
            >
              <ShieldOff className="mr-2 h-4 w-4" />
              Cordon
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => uncordonMutation.mutate(row.original.name)}
            >
              <Shield className="mr-2 h-4 w-4" />
              Uncordon
            </DropdownMenuItem>
          )}
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
  ], [nodesWithMetrics, cordonMutation, uncordonMutation, drainMutation]);

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="nodes" />;
  }

  return (
    <div className="space-y-4">
      <ResourceListHeader
        title="Nodes"
        isFetching={isFetching}
        isLoading={isLoading}
        onRefresh={() => refetch()}
      />
      <DataTable
        columns={columns}
        data={nodesWithMetrics}
        isLoading={isLoading && nodes.length === 0}
        isFetching={isFetching && !isLoading}
      />
    </div>
  );
}
