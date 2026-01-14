import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link2, Copy, ExternalLink } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import type { ServiceInfo } from "@/generated/types";

interface ServiceAccessInfoProps {
  service: ServiceInfo;
}

export function ServiceAccessInfo({ service }: ServiceAccessInfoProps) {
  const copyToClipboard = useCopyToClipboard();

  const internalDns = `${service.name}.${service.namespace}.svc.cluster.local`;
  const shortDns = `${service.name}`;

  // Build access URLs based on service type
  const accessItems: Array<{
    label: string;
    url: string;
    canOpen: boolean;
    description: string;
  }> = [];

  if (service.type === "LoadBalancer" && service.externalIps.length > 0) {
    const port = service.ports[0]?.port;
    const url = `http://${service.externalIps[0]}${port && port !== 80 ? `:${port}` : ""}`;
    accessItems.push({
      label: "External (LoadBalancer)",
      url,
      canOpen: true,
      description: "Access via load balancer IP",
    });
  }

  if (service.type === "NodePort" && service.ports.some(p => p.nodePort)) {
    const nodePort = service.ports.find(p => p.nodePort)?.nodePort;
    accessItems.push({
      label: "External (NodePort)",
      url: `<any-node-ip>:${nodePort}`,
      canOpen: false,
      description: "Access via any cluster node IP",
    });
  }

  if (service.type === "ExternalName") {
    accessItems.push({
      label: "External Name",
      url: service.clusterIp || "N/A",
      canOpen: false,
      description: "DNS alias to external service",
    });
  }

  // Internal access for all types except ExternalName
  if (service.type !== "ExternalName") {
    const port = service.ports[0]?.port;
    accessItems.push({
      label: "Internal (full DNS)",
      url: `${internalDns}${port ? `:${port}` : ""}`,
      canOpen: false,
      description: "From any namespace in cluster",
    });
    accessItems.push({
      label: "Internal (short)",
      url: `${shortDns}${port ? `:${port}` : ""}`,
      canOpen: false,
      description: "From same namespace only",
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          How to Access This Service
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {accessItems.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg border p-3 bg-muted/30"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                <code className="text-sm font-mono text-muted-foreground break-all">
                  {item.url}
                </code>
                <p className="text-xs text-muted-foreground mt-1">
                  {item.description}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(item.url)}
                  title="Copy"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                {item.canOpen && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(item.url, "_blank", "noreferrer")}
                    title="Open in Browser"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {service.type === "ClusterIP" && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50 border">
            <p className="text-sm text-muted-foreground">
              <strong>ClusterIP</strong> services are only accessible from within the cluster.
              Use port-forward for local development:
              <code className="ml-1 text-xs bg-muted px-1 rounded">
                kubectl port-forward svc/{service.name} {service.ports[0]?.port || 8080}:{service.ports[0]?.port || 8080}
              </code>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
