import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { YamlTabContent } from "@/components/resources/YamlTabContent";
import { LabelsDisplay } from "@/components/resources/LabelsDisplay";
import {
  InfoCard,
  ResourceDetailLayout,
} from "@/components/resources/ResourceDetailLayout";
import { useResourceDetail } from "@/hooks";
import { ResourceType } from "@/lib/resource-registry";
import { Network, Globe, Server } from "lucide-react";
import { commands } from "@/lib/commands";
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

  if (!service && !isLoading && !error) {
    return null;
  }

  const ports = service?.ports ?? [];
  const externalIps = service?.externalIps ?? [];
  const selector = service?.selector ?? {};
  const labels = service?.labels ?? {};
  const annotations = service?.annotations ?? {};

  const tabs = [
    {
      id: "ports",
      label: "Ports",
      content: (
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
      ),
    },
    {
      id: "selector",
      label: "Selector",
      content: (
        <LabelsDisplay
          labels={selector}
          title="Pod Selector"
          emptyMessage="No selector defined"
        />
      ),
    },
    {
      id: "labels",
      label: "Labels",
      content: (
        <div className="space-y-4">
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
        </div>
      ),
    },
    {
      id: "yaml",
      label: "YAML",
      content: (
        <YamlTabContent
          title="Service YAML"
          yaml={serviceYaml}
          resourceKind={ResourceType.Service}
          resourceName={name || ""}
          namespace={namespace}
          onCopy={copyYaml}
        />
      ),
    },
  ];

  return (
    <ResourceDetailLayout
      resource={service}
      isLoading={isLoading}
      isFetching={isFetching}
      error={error}
      resourceKind={ResourceType.Service}
      title={service?.name || ""}
      namespace={service?.namespace}
      statusBadge={service && <StatusBadge status={service.type} />}
      icon={<Network className="h-8 w-8 text-muted-foreground" />}
      onBack={goBack}
      onRefresh={refetch}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard
          title="Cluster IP"
          icon={<Server className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="text-xl font-bold font-mono">
            {service?.clusterIp || "None"}
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
    </ResourceDetailLayout>
  );
}
