import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { YamlTabContent } from "@/components/resources/YamlTabContent";
import { LabelsDisplay } from "@/components/resources/LabelsDisplay";
import { AnnotationsDisplay } from "@/components/resources/AnnotationsDisplay";
import {
    InfoCard,
    ResourceDetailLayout,
} from "@/components/resources/ResourceDetailLayout";
import { useResourceDetail } from "@/hooks";
import { ResourceType } from "@/lib/resource-registry";
import { FileText, Key, Copy, Eye, EyeOff } from "lucide-react";
import { commands } from "@/lib/commands";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/hooks";
import { useQuery } from "@tanstack/react-query";
import type { ConfigMapInfo } from "@/generated/types";

export function ConfigMapDetail() {
    const copyToClipboard = useCopyToClipboard();
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

    const {
        name,
        namespace,
        resource: configMap,
        isLoading,
        isFetching,
        error,
        refetch,
        yaml: configMapYaml,
        copyYaml,
        activeTab,
        setActiveTab,
        goBack,
    } = useResourceDetail<ConfigMapInfo>({
        resourceKind: ResourceType.ConfigMap,
        fetchResource: (name, ns) => commands.getConfigmap(name, ns),
        deleteResource: (name, ns) => commands.deleteConfigmap(name, ns),
        defaultTab: "data",
    });

    // Fetch actual data for the ConfigMap
    const { data: configMapData = {} } = useQuery({
        queryKey: ["configmap-data", name, namespace],
        queryFn: async () => {
            if (!name || !namespace) return {};
            return commands.getConfigmapData(name, namespace);
        },
        enabled: !!name && !!namespace,
    });

    if (!configMap && !isLoading && !error) {
        return null;
    }

    const dataKeys = configMap?.dataKeys ?? [];
    const labels = configMap?.labels ?? {};
    const annotations = configMap?.annotations ?? {};

    const toggleExpand = (key: string) => {
        setExpandedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const handleCopyValue = (key: string, value: string) => {
        copyToClipboard(value, `Value of "${key}" copied to clipboard.`);
    };

    const handleCopyAllData = () => {
        copyToClipboard(
            JSON.stringify(configMapData, null, 2),
            "All ConfigMap data copied to clipboard."
        );
    };

    const tabs = [
        {
            id: "data",
            label: "Data",
            content: (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Data Keys ({dataKeys.length})</CardTitle>
                        {Object.keys(configMapData).length > 0 && (
                            <Button variant="outline" size="sm" onClick={handleCopyAllData}>
                                <Copy className="h-4 w-4 mr-2" />
                                Copy All
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {dataKeys.map((key) => {
                                const value = configMapData[key] ?? "";
                                const isExpanded = expandedKeys.has(key);
                                const isLongValue = value.length > 200;
                                const displayValue = isExpanded || !isLongValue
                                    ? value
                                    : value.substring(0, 200) + "...";

                                return (
                                    <div key={key} className="rounded-lg border p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Key className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium">{key}</span>
                                                <Badge variant="secondary" className="text-xs">
                                                    {value.length} chars
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {isLongValue && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => toggleExpand(key)}
                                                    >
                                                        {isExpanded ? (
                                                            <EyeOff className="h-4 w-4" />
                                                        ) : (
                                                            <Eye className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleCopyValue(key, value)}
                                                >
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        <pre className="bg-muted p-2 rounded text-sm overflow-x-auto whitespace-pre-wrap break-all">
                                            {displayValue}
                                        </pre>
                                    </div>
                                );
                            })}
                            {dataKeys.length === 0 && (
                                <p className="text-muted-foreground">No data keys defined</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "metadata",
            label: "Metadata",
            content: (
                <div className="space-y-4">
                    <LabelsDisplay labels={labels} title="Labels" />
                    <AnnotationsDisplay annotations={annotations} />
                </div>
            ),
        },
        {
            id: "yaml",
            label: "YAML",
            content: (
                <YamlTabContent
                    title="ConfigMap YAML"
                    yaml={configMapYaml}
                    resourceKind={ResourceType.ConfigMap}
                    resourceName={name || ""}
                    namespace={namespace}
                    onCopy={copyYaml}
                />
            ),
        },
    ];

    return (
        <ResourceDetailLayout
            resource={configMap}
            isLoading={isLoading}
            isFetching={isFetching}
            error={error}
            resourceKind={ResourceType.ConfigMap}
            title={configMap?.name || ""}
            namespace={configMap?.namespace}
            icon={<FileText className="h-8 w-8 text-muted-foreground" />}
            onBack={goBack}
            onRefresh={refetch}
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
        >
            <div className="grid gap-4 md:grid-cols-2">
                <InfoCard
                    title="Data Keys"
                    icon={<Key className="h-4 w-4 text-muted-foreground" />}
                >
                    <div className="text-xl font-bold">{dataKeys.length}</div>
                </InfoCard>

                <InfoCard
                    title="Labels"
                    icon={<FileText className="h-4 w-4 text-muted-foreground" />}
                >
                    <div className="text-xl font-bold">{Object.keys(labels).length}</div>
                </InfoCard>
            </div>
        </ResourceDetailLayout>
    );
}
