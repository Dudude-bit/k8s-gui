import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { YamlTabContent } from "@/components/resources/YamlTabContent";
import {
    ResourceDetailLayout,
    InfoCard,
} from "@/components/resources/ResourceDetailLayout";
import { useResourceDetail } from "@/hooks";
import { ResourceType } from "@/lib/resource-types";
import { Globe, ExternalLink, Shield, Network } from "lucide-react";
import * as commands from "@/generated/commands";
import type { IngressInfo } from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";

export function IngressDetail() {
    const {
        name,
        namespace,
        resource: ingress,
        isLoading,
        isFetching,
        error,
        refetch,
        yaml: ingressYaml,
        copyYaml,
        activeTab,
        setActiveTab,
        goBack,
    } = useResourceDetail<IngressInfo>({
        resourceKind: ResourceType.Ingress,
        fetchResource: async (name, ns) => {
            try {
                return await commands.getIngress(name, ns);
            } catch (err) {
                throw new Error(normalizeTauriError(err));
            }
        },
        deleteResource: async (name, ns) => {
            try {
                await commands.deleteIngress(name, ns);
            } catch (err) {
                throw new Error(normalizeTauriError(err));
            }
        },
        defaultTab: "rules",
    });

    const rules = ingress?.rules ?? [];
    const tlsHosts = ingress?.tlsHosts ?? [];
    const loadBalancerIps = ingress?.loadBalancerIps ?? [];

    const tabs = [
        {
            id: "rules",
            label: "Rules",
            content: (
                <Card>
                    <CardHeader>
                        <CardTitle>Ingress Rules</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {rules.map((rule, idx) => (
                                <div key={idx} className="rounded-lg border p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Badge variant="outline">{rule.host || "*"}</Badge>
                                    </div>
                                    <div className="space-y-2">
                                        {rule.paths.map((path, pathIdx) => (
                                            <div
                                                key={pathIdx}
                                                className="flex items-center justify-between rounded border p-2 bg-muted/30"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <code className="text-sm">{path.path}</code>
                                                    <Badge variant="secondary" className="text-xs">
                                                        {path.pathType}
                                                    </Badge>
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    → {path.backendService}:{path.backendPort}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {rules.length === 0 && (
                                <p className="text-muted-foreground">No rules defined</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "tls",
            label: "TLS",
            content: (
                <Card>
                    <CardHeader>
                        <CardTitle>TLS Configuration</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {tlsHosts.length > 0 ? (
                            <div className="space-y-2">
                                {tlsHosts.map((host, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center gap-2 rounded-lg border p-3"
                                    >
                                        <Shield className="h-4 w-4 text-green-500" />
                                        <span className="font-mono">{host}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">No TLS configured</p>
                        )}
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "yaml",
            label: "YAML",
            content: (
                <YamlTabContent
                    title="Ingress YAML"
                    yaml={ingressYaml}
                    resourceKind={ResourceType.Ingress}
                    resourceName={name || ""}
                    namespace={namespace}
                    onCopy={copyYaml}
                />
            ),
        },
    ];

    return (
        <ResourceDetailLayout
            resource={ingress}
            isLoading={isLoading}
            isFetching={isFetching}
            error={error}
            resourceKind={ResourceType.Ingress}
            title={ingress?.name || name || ""}
            namespace={ingress?.namespace || namespace}
            badges={
                <>
                    {ingress?.className && <Badge variant="outline">{ingress.className}</Badge>}
                    {tlsHosts.length > 0 && (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                            <Shield className="mr-1 h-3 w-3" />
                            TLS
                        </Badge>
                    )}
                </>
            }
            icon={<Globe className="h-8 w-8 text-muted-foreground" />}
            onBack={goBack}
            onRefresh={() => refetch()}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={tabs}
        >
            <div className="grid gap-4 md:grid-cols-3">
                <InfoCard
                    title="Ingress Class"
                    icon={<Globe className="h-4 w-4 text-muted-foreground" />}
                >
                    <div className="text-xl font-bold">
                        {ingress?.className || "default"}
                    </div>
                </InfoCard>

                <InfoCard
                    title="Load Balancer IPs"
                    icon={<ExternalLink className="h-4 w-4 text-muted-foreground" />}
                >
                    <div className="text-xl font-bold">
                        {loadBalancerIps.length > 0 ? loadBalancerIps.join(", ") : "Pending"}
                    </div>
                </InfoCard>

                <InfoCard
                    title="Rules"
                    icon={<Network className="h-4 w-4 text-muted-foreground" />}
                >
                    <div className="text-xl font-bold">{rules.length}</div>
                </InfoCard>
            </div>
        </ResourceDetailLayout>
    );
}
