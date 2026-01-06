import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { YamlTabContent } from "@/components/resources/YamlTabContent";
import { ResourceDetailHeader } from "@/components/resources/ResourceDetailHeader";
import { LabelsDisplay } from "@/components/resources/LabelsDisplay";
import { DetailSkeleton } from "@/components/ui/skeleton";
import {
  DetailError,
  InfoCard,
} from "@/components/resources/ResourceDetailLayout";
import { useResourceDetail } from "@/hooks";
import { ResourceType } from "@/lib/resource-types";
import { Network, Globe, Server } from "lucide-react";
import * as commands from "@/generated/commands";
import type { ServiceInfo } from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";

export function ServiceDetail() {
  const {
    name,
    namespace,
    resource: service,
    isLoading,
    isFetching,
    error,
    refetch,
    yaml: serviceYaml,
    copyYaml,
    activeTab,
    setActiveTab,
    goBack,
  } = useResourceDetail<ServiceInfo>({
    resourceKind: ResourceType.Service,
    fetchResource: async (name, ns) => {
      try {
        return await commands.getService(name, ns);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    deleteResource: async (name, ns) => {
      try {
        await commands.deleteService(name, ns);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    defaultTab: "ports",
  });

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (error || !service) {
    return <DetailError error={error} resourceKind={ResourceType.Service} onBack={goBack} />;
  }

  const ports = service.ports ?? [];
  const externalIps = service.externalIps ?? [];
  const selector = service.selector ?? {};
  const labels = service.labels ?? {};
  const annotations = service.annotations ?? {};

  // 'type' is a reserved keyword in some contexts but fine as property
  // Generated type uses 'type' (camelCase) usually, but 'type_' might be used in Rust if it's a keyword.
  // Checking previous files, 'type_' was common in manually defined types.
  // In generated types, it's often 'type' unless it conflicts.
  // Let's assume 'type' based on NodeInfo changes, but might be 'type_' if binding generation preserved it.
  // Wait, I saw 'type' in container state.
  // For Service, let's check generated types if 'type' or 'type_' is used.
  // Actually I cannot verify without reading types.ts. I will assume 'type' first, if error, I fix.
  // Re-reading my previous viewing of types.ts or grep...
  // I will check types.ts for ServiceInfo definition to be sure.

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <ResourceDetailHeader
        title={service.name}
        namespace={service.namespace}
        badges={<StatusBadge status={service.type} />}
        icon={<Network className="h-8 w-8 text-muted-foreground" />}
        onBack={goBack}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard
          title="Cluster IP"
          icon={<Server className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="text-xl font-bold font-mono">
            {service.clusterIp || "None"}
          </div>
        </InfoCard>

        <InfoCard
          title="External IPs"
          icon={<Globe className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="text-xl font-bold font-mono">
            {externalIps.length > 0 ? externalIps.join(", ") : "None"}
          </div>
        </InfoCard>

        <InfoCard
          title="Ports"
          icon={<Network className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="text-xl font-bold">{ports.length}</div>
        </InfoCard>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="ports">Ports</TabsTrigger>
          <TabsTrigger value="selector">Selector</TabsTrigger>
          <TabsTrigger value="labels">Labels</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
        </TabsList>

        <TabsContent value="ports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Service Ports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {ports.map((port, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{port.protocol}</Badge>
                      <span className="font-mono">
                        {port.name ? `${port.name}: ` : ""}
                        {port.port} → {port.targetPort}
                      </span>
                    </div>
                    {port.nodePort && (
                      <Badge variant="secondary">
                        NodePort: {port.nodePort}
                      </Badge>
                    )}
                  </div>
                ))}
                {ports.length === 0 && (
                  <p className="text-muted-foreground">No ports defined</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="selector" className="space-y-4">
          <LabelsDisplay
            labels={selector}
            title="Pod Selector"
            emptyMessage="No selector defined"
          />
        </TabsContent>

        <TabsContent value="labels" className="space-y-4">
          <LabelsDisplay labels={labels} title="Labels" />

          <Card>
            <CardHeader>
              <CardTitle>Annotations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(annotations).map(([key, value]) => (
                  <div key={key} className="rounded-lg border p-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {key}
                    </p>
                    <p className="font-mono text-sm break-all">{value}</p>
                  </div>
                ))}
                {Object.keys(annotations).length === 0 && (
                  <p className="text-muted-foreground">No annotations</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="yaml">
          <YamlTabContent
            title="Service YAML"
            yaml={serviceYaml}
            resourceKind={ResourceType.Service}
            resourceName={name || ""}
            namespace={namespace}
            onCopy={copyYaml}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
