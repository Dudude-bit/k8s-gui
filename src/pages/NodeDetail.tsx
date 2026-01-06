import { useParams, useNavigate } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HeaderStatsSkeleton } from "@/components/ui/skeleton";
import { Server, Cpu, HardDrive, MemoryStick, Lock } from "lucide-react";
import { formatKubernetesBytes } from "@/lib/k8s-quantity";
import { useNodeMetrics } from "@/hooks/useNodeMetrics";
import { MetricCard } from "@/components/ui/metric-card";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { ResourceDetailHeader } from "@/components/resources/ResourceDetailHeader";
import { ConditionsDisplay } from "@/components/resources/ConditionsDisplay";
import { LabelsDisplay } from "@/components/resources/LabelsDisplay";
import { useResourceWatch, ResourceType } from "@/hooks/useResourceWatch";
import { useClusterStore } from "@/stores/clusterStore";
import { useMemo } from "react";
import * as commands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";

export function NodeDetail() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { hasAccess } = usePremiumFeature();
  const { isConnected } = useClusterStore();

  // Real-time watch for automatic updates
  const { isWatching } = useResourceWatch({
    resourceType: ResourceType.Node,
    namespace: null,
    enabled: isConnected && !!name,
    queryKeysToInvalidate: [["node", name ?? ""], ["node-pods", name ?? ""]],
  });

  const {
    data: node,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["node", name],
    queryFn: async () => {
      try {
        if (!name) throw new Error("Name is required");
        return await commands.getNode(name);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: !!name,
    placeholderData: keepPreviousData,
  });

  const { data: podCount } = useQuery({
    queryKey: ["node-pods", name],
    queryFn: async () => {
      try {
        if (!name) return 0;
        const pods = await commands.getNodePods(name);
        return pods.length;
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
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
      cpuUsage: metrics?.cpuUsage ?? null,
      memoryUsage: metrics?.memoryUsage ?? null,
    };
  }, [node, nodeMetrics]);

  if (isLoading) {
    return <HeaderStatsSkeleton stats={4} />;
  }

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Node not found
      </div>
    );
  }

  const getInternalIP = () => {
    const internal = node.status.addresses.find((a) => a.type === "InternalIP");
    return internal?.address || "-";
  };

  const getExternalIP = () => {
    const external = node.status.addresses.find((a) => a.type === "ExternalIP");
    return external?.address || "-";
  };

  const renderPremiumMetricCard = (title: string) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Lock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">Premium feature</div>
      </CardContent>
    </Card>
  );

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
            <StatusBadge status={node.status.ready ? "Ready" : "NotReady"} />
          </>
        }
        icon={<Server className="h-8 w-8 text-muted-foreground" />}
        onBack={() => navigate(-1)}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        isWatching={isWatching}
      />

      {/* Resource Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {hasAccess ? (
          <MetricCard
            title="CPU Usage"
            used={nodeWithMetrics?.cpuUsage ?? null}
            total={node.capacity.cpu ?? null}
            type="cpu"
            icon={<Cpu className="h-4 w-4" />}
            showProgressBar={true}
            description={
              node.allocatable.cpu
                ? `Allocatable: ${node.allocatable.cpu}`
                : undefined
            }
          />
        ) : (
          renderPremiumMetricCard("CPU Usage")
        )}

        {hasAccess ? (
          <MetricCard
            title="Memory Usage"
            used={nodeWithMetrics?.memoryUsage ?? null}
            total={node.capacity.memory ?? null}
            type="memory"
            icon={<MemoryStick className="h-4 w-4" />}
            showProgressBar={true}
            description={
              node.allocatable.memory
                ? `Allocatable: ${formatKubernetesBytes(node.allocatable.memory)}`
                : undefined
            }
          />
        ) : (
          renderPremiumMetricCard("Memory Usage")
        )}

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
              {formatKubernetesBytes(node.capacity.ephemeralStorage)}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              Allocatable:{" "}
              {formatKubernetesBytes(node.allocatable.ephemeralStorage)}
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
                <p>{node.containerRuntime}</p>
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
                  {node.createdAt
                    ? new Date(node.createdAt).toLocaleString()
                    : "-"}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conditions" className="space-y-4">
          <ConditionsDisplay
            conditions={node.status.conditions.map((c) => ({
              type_: c.type,
              status: c.status,
              reason: c.reason,
              message: c.message,
              last_transition_time: c.lastTransitionTime,
            }))}
            title="Conditions"
          />
        </TabsContent>

        <TabsContent value="labels" className="space-y-4">
          <LabelsDisplay labels={node.labels} title="Labels" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
