import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { YamlTabContent } from "@/components/resources/YamlTabContent";
import {
    ResourceDetailLayout,
    InfoCard,
} from "@/components/resources/ResourceDetailLayout";
import { useResourceDetail } from "@/hooks";
import { ResourceType } from "@/lib/resource-types";
import { HardDrive, Link as LinkIcon, Database } from "lucide-react";
import * as commands from "@/generated/commands";
import type { PersistentVolumeInfo } from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";
import { StatusBadge } from "@/components/ui/status-badge";

export function PersistentVolumeDetail() {
    const {
        name,
        resource: pv,
        isLoading,
        isFetching,
        error,
        refetch,
        yaml: pvYaml,
        copyYaml,
        activeTab,
        setActiveTab,
        goBack,
    } = useResourceDetail<PersistentVolumeInfo>({
        resourceKind: ResourceType.PersistentVolume,
        isClusterScoped: true,
        fetchResource: async (name) => {
            try {
                return await commands.getPersistentVolume(name);
            } catch (err) {
                throw new Error(normalizeTauriError(err));
            }
        },
        deleteResource: async (name) => {
            try {
                await commands.deletePersistentVolume(name);
            } catch (err) {
                throw new Error(normalizeTauriError(err));
            }
        },
        defaultTab: "details",
    });

    const tabs = [
        {
            id: "details",
            label: "Details",
            content: (
                <Card>
                    <CardHeader>
                        <CardTitle>Volume Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Status</p>
                                <StatusBadge status={pv?.status || ""} />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Capacity</p>
                                <p className="font-mono">{pv?.capacity}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Access Modes</p>
                                <div className="flex flex-wrap gap-1">
                                    {pv?.accessModes.map((mode, i) => (
                                        <Badge key={i} variant="outline">{mode}</Badge>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Reclaim Policy</p>
                                <Badge variant="outline">{pv?.reclaimPolicy}</Badge>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Storage Class</p>
                                <p className="font-mono">{pv?.storageClass || "-"}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Claim</p>
                                <p className="font-mono">{pv?.claim || "Unbound"}</p>
                            </div>
                            {pv?.reason && (
                                <div className="col-span-2">
                                    <p className="text-sm text-muted-foreground">Reason</p>
                                    <p>{pv.reason}</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "yaml",
            label: "YAML",
            content: (
                <YamlTabContent
                    title="PersistentVolume YAML"
                    yaml={pvYaml}
                    resourceKind={ResourceType.PersistentVolume}
                    resourceName={name || ""}
                    namespace={undefined}
                    onCopy={copyYaml}
                />
            ),
        },
    ];

    return (
        <ResourceDetailLayout
            resource={pv}
            isLoading={isLoading}
            isFetching={isFetching}
            error={error}
            resourceKind={ResourceType.PersistentVolume}
            title={pv?.name || name || ""}
            namespace={undefined}
            badges={<StatusBadge status={pv?.status || ""} />}
            icon={<HardDrive className="h-8 w-8 text-muted-foreground" />}
            onBack={goBack}
            onRefresh={() => refetch()}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={tabs}
        >
            <div className="grid gap-4 md:grid-cols-4">
                <InfoCard
                    title="Capacity"
                    icon={<Database className="h-4 w-4 text-muted-foreground" />}
                >
                    <div className="text-xl font-bold">{pv?.capacity}</div>
                </InfoCard>

                <InfoCard
                    title="Access Modes"
                    icon={<LinkIcon className="h-4 w-4 text-muted-foreground" />}
                >
                    <div className="flex flex-wrap gap-1">
                        {pv?.accessModes.map((mode, i) => (
                            <Badge key={i} variant="secondary">{mode}</Badge>
                        ))}
                    </div>
                </InfoCard>

                <InfoCard
                    title="Reclaim Policy"
                    icon={<HardDrive className="h-4 w-4 text-muted-foreground" />}
                >
                    <div className="text-xl font-bold">{pv?.reclaimPolicy}</div>
                </InfoCard>

                <InfoCard
                    title="Storage Class"
                    icon={<Database className="h-4 w-4 text-muted-foreground" />}
                >
                    <div className="text-xl font-bold">{pv?.storageClass || "-"}</div>
                </InfoCard>
            </div>
        </ResourceDetailLayout>
    );
}

