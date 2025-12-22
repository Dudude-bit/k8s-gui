import { useParams, useNavigate } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Server,
  Cpu,
  HardDrive,
  MemoryStick,
} from "lucide-react";
import { formatKubernetesBytes } from "@/lib/utils";
import { useNodeMetrics } from "@/hooks/useNodeMetrics";
import { ResourceUsage } from "@/components/ui/resource-usage";
import { ResourceDetailHeader } from "@/components/resources/ResourceDetailHeader";
import { useMemo } from "react";

interface NodeAddressInfo {
  type_: string;
  address: string;
}

interface ConditionInfo {
  type_: string;
  status: string;
  message: string | null;
  reason: string | null;
  last_transition_time: string | null;
}

interface NodeStatusInfo {
  ready: boolean;
  conditions: ConditionInfo[];
  addresses: NodeAddressInfo[];
}

interface ResourceQuantities {
  cpu: string | null;
  memory: string | null;
  pods: string | null;
  ephemeral_storage: string | null;
}

interface NodeInfo {
  name: string;
  uid: string;
  status: NodeStatusInfo;
  roles: string[];
  version: string;
  os: string;
  arch: string;
  container_runtime: string;
  labels: Record<string, string>;
  capacity: ResourceQuantities;
  allocatable: ResourceQuantities;
  created_at: string | null;
}

export function NodeDetail() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();

  const {
    data: node,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["node", name],
    queryFn: async () => {
      return invoke<NodeInfo>("get_node", { name });
    },
    enabled: !!name,
    placeholderData: keepPreviousData,
  });

  const { data: podCount } = useQuery({
    queryKey: ["node-pods", name],
    queryFn: async () => {
      const pods = await invoke<unknown[]>("get_node_pods", { name });
      return pods.length;
    },
    enabled: !!name,
    placeholderData: keepPreviousData,
  });

  // Get node metrics for real-time updates
  const { data: nodeMetrics = [] } = useNodeMetrics();
  const nodeWithMetrics = useMemo(() => {
    if (!node) return null;
    const metrics = nodeMetrics.find((m) => m.name === node.name);
    return {
      ...node,
      cpu_usage: metrics?.cpu_usage ?? null,
      memory_usage: metrics?.memory_usage ?? null,
    };
  }, [node, nodeMetrics]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Node not found
      </div>
    );
  }

  const getInternalIP = () => {
    const internal = node.status.addresses.find(
      (a) => a.type_ === "InternalIP",
    );
    return internal?.address || "-";
  };

  const getExternalIP = () => {
    const external = node.status.addresses.find(
      (a) => a.type_ === "ExternalIP",
    );
    return external?.address || "-";
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <ResourceDetailHeader
        title={node.name}
        badges={
          <>
            {node.roles.map((role) => (
              <Badge key={role} variant="outline">
                {role}
              </Badge>
            ))}
            <Badge
              className={node.status.ready ? "bg-green-500" : "bg-red-500"}
            >
              {node.status.ready ? "Ready" : "NotReady"}
            </Badge>
          </>
        }
        icon={<Server className="h-8 w-8 text-muted-foreground" />}
        onBack={() => navigate(-1)}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      {/* Resource Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {nodeWithMetrics ? (
              <ResourceUsage
                used={nodeWithMetrics.cpu_usage ?? null}
                total={node.capacity.cpu ?? null}
                type="cpu"
                showProgressBar={true}
              />
            ) : (
              <>
                <div className="text-2xl font-bold">{node.capacity.cpu || "-"}</div>
                <p className="text-xs text-muted-foreground">
                  Allocatable: {node.allocatable.cpu || "-"}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {nodeWithMetrics ? (
              <ResourceUsage
                used={nodeWithMetrics.memory_usage ?? null}
                total={node.capacity.memory ?? null}
                type="memory"
                showProgressBar={true}
              />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatKubernetesBytes(node.capacity.memory)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Allocatable: {formatKubernetesBytes(node.allocatable.memory)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pods (running)
            </CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{podCount ?? "-"}</div>
            <p className="text-xs text-muted-foreground">
              Allocatable: {node.allocatable.pods || node.capacity.pods || "-"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate text-lg">
              {formatKubernetesBytes(node.capacity.ephemeral_storage)}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              Allocatable:{" "}
              {formatKubernetesBytes(node.allocatable.ephemeral_storage)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="w-full">
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="conditions">Conditions</TabsTrigger>
          <TabsTrigger value="labels">Labels</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Node Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Internal IP
                </p>
                <p className="font-mono">{getInternalIP()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  External IP
                </p>
                <p className="font-mono">{getExternalIP()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Kubernetes Version
                </p>
                <p>{node.version}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Container Runtime
                </p>
                <p>{node.container_runtime}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">OS</p>
                <p>{node.os}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Architecture
                </p>
                <p>{node.arch}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Created
                </p>
                <p>
                  {node.created_at
                    ? new Date(node.created_at).toLocaleString()
                    : "-"}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conditions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {node.status.conditions.map((condition, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          condition.status === "True" ? "default" : "secondary"
                        }
                      >
                        {condition.type_}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {condition.message || condition.reason || "-"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {condition.last_transition_time
                        ? new Date(
                            condition.last_transition_time,
                          ).toLocaleString()
                        : "-"}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="labels" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Labels</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(node.labels).map(([key, value]) => (
                  <Badge
                    key={key}
                    variant="outline"
                    className="font-mono text-xs"
                  >
                    {key}={value}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
