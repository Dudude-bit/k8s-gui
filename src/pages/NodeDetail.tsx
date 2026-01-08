import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Server, Cpu, HardDrive, MemoryStick, Lock } from "lucide-react";
import { formatKubernetesBytes, parseCPU, parseMemory } from "@/lib/k8s-quantity";
import { MetricCard } from "@/components/ui/metric-card";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { ConditionsDisplay } from "@/components/resources/ConditionsDisplay";
import { LabelsDisplay } from "@/components/resources/LabelsDisplay";
import { useMemo } from "react";
import * as commands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";
import { useResourceDetail } from "@/hooks";
import { ResourceType } from "@/lib/resource-types";
import { InfoRow, ResourceDetailLayout } from "@/components/resources/ResourceDetailLayout";
import type { NodeInfo } from "@/generated/types";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useMetrics } from "@/hooks/useMetrics";
import { MetricsStatusBanner } from "@/components/metrics";
import { mergeNodesWithMetrics } from "@/lib/metrics";

export function NodeDetail() {
  const { hasAccess } = usePremiumFeature();

  const {
    name,
    resource: node,
    isLoading,
    isFetching,
    error,
    refetch,
    activeTab,
    setActiveTab,
    goBack,
  } = useResourceDetail<NodeInfo>({
    resourceKind: ResourceType.Node,
    isClusterScoped: true,
    fetchResource: async (name) => {
      try {
        return await commands.getNode(name);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    defaultTab: "info",
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

  const { nodeMetrics, nodeStatus } = useMetrics({
    includePods: false,
    includeCluster: false,
    enabled: !!node,
  });
  const nodeWithMetrics = useMemo(() => {
    if (!node) return null;
    return mergeNodesWithMetrics([node], nodeMetrics)[0] ?? null;
  }, [node, nodeMetrics]);

  if (!node && !isLoading && !error) {
    return null;
  }

  const getInternalIP = () => {
    const internal = node?.status.addresses.find((a) => a.type === "InternalIP");
    return internal?.address || "-";
  };

  const getExternalIP = () => {
    const external = node?.status.addresses.find((a) => a.type === "ExternalIP");
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

  const tabs = [
    {
      id: "info",
      label: "Info",
      content: (
        <Card>
          <CardHeader>
            <CardTitle>Node Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <InfoRow label="Internal IP" value={<span className="font-mono">{getInternalIP()}</span>} />
            <InfoRow label="External IP" value={<span className="font-mono">{getExternalIP()}</span>} />
            <InfoRow label="Kubernetes Version" value={node?.version} />
            <InfoRow label="Container Runtime" value={node?.containerRuntime} />
            <InfoRow label="OS" value={node?.os} />
            <InfoRow label="Architecture" value={node?.arch} />
            <InfoRow
              label="Created"
              value={node?.createdAt ? new Date(node.createdAt).toLocaleString() : "-"}
            />
          </CardContent>
        </Card>
      ),
    },
    {
      id: "conditions",
      label: "Conditions",
      content: (
        <ConditionsDisplay
          conditions={node?.status.conditions || []}
          title="Conditions"
        />
      ),
    },
    {
      id: "labels",
      label: "Labels",
      content: <LabelsDisplay labels={node?.labels || {}} title="Labels" />,
    },
  ];

  return (
    <ResourceDetailLayout
      resource={node}
      isLoading={isLoading}
      isFetching={isFetching}
      error={error}
      resourceKind={ResourceType.Node}
      title={node?.name || ""}
      badges={
        node && (
          <>
            {node.roles.map((role) => (
              <Badge key={role} variant="outline">
                {role}
              </Badge>
            ))}
            <StatusBadge status={node.status.ready ? "Ready" : "NotReady"} />
          </>
        )
      }
      icon={<Server className="h-8 w-8 text-muted-foreground" />}
      onBack={goBack}
      onRefresh={refetch}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {hasAccess && nodeStatus?.status !== "available" && (
        <MetricsStatusBanner status={nodeStatus} />
      )}
      <div className="grid gap-4 md:grid-cols-4">
        {hasAccess ? (
          <MetricCard
            title="CPU Usage"
            used={nodeWithMetrics?.cpuMillicores ?? null}
            total={node?.capacity.cpu ? parseCPU(node.capacity.cpu) : null}
            type="cpu"
            icon={<Cpu className="h-4 w-4" />}
            showProgressBar={true}
            description={
              node?.allocatable.cpu
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
            used={nodeWithMetrics?.memoryBytes ?? null}
            total={node?.capacity.memory ? parseMemory(node.capacity.memory) : null}
            type="memory"
            icon={<MemoryStick className="h-4 w-4" />}
            showProgressBar={true}
            description={
              node?.allocatable.memory
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
              Allocatable:{" "}
              {node?.allocatable.pods || node?.capacity.pods || "-"}
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
              {node && formatKubernetesBytes(node.capacity.ephemeralStorage)}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              Allocatable:{" "}
              {node && formatKubernetesBytes(node.allocatable.ephemeralStorage)}
            </p>
          </CardContent>
        </Card>
      </div>
    </ResourceDetailLayout>
  );
}
