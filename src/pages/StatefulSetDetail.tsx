import { Link } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import type { StatefulSetDetailInfo } from "@/generated/types";
import { ResourceType, toPlural } from "@/lib/resource-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatAge } from "@/lib/utils";
import { Trash2, Database, RefreshCw } from "lucide-react";
import { YamlTabContent } from "@/components/resources/YamlTabContent";
import { ConditionsDisplay } from "@/components/resources/ConditionsDisplay";
import { LabelsDisplay } from "@/components/resources/LabelsDisplay";
import { EnvironmentVariables } from "@/components/resources/EnvironmentVariables";
import { ResourceDetailLayout, InfoCard, InfoRow } from "@/components/resources/ResourceDetailLayout";
import { normalizeTauriError } from "@/lib/error-utils";
import { useResourceDetail } from "@/hooks";

export function StatefulSetDetail() {
  const {
    name,
    namespace,
    resource: statefulSet,
    isLoading,
    isFetching,
    error,
    refetch,
    yaml,
    copyYaml,
    activeTab,
    setActiveTab,
    goBack,
    deleteMutation,
  } = useResourceDetail<StatefulSetDetailInfo>({
    resourceKind: ResourceType.StatefulSet,
    fetchResource: async (name: string, ns: string | null) => {
      try {
        return await commands.getStatefulset(name, ns);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    deleteResource: async (name: string, ns: string | null) => {
      try {
        await commands.deleteStatefulset(name, ns);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    defaultTab: "overview",
  });

  // Fetch pods for this StatefulSet
  const { data: pods = [] } = useQuery({
    queryKey: ["statefulset-pods", namespace, name],
    queryFn: async () => {
      if (!name || !namespace) return [];
      try {
        // StatefulSet pods typically have a label app=<statefulset-name>
        const allPods = await commands.listPods({
          namespace: namespace,
          labelSelector: `app=${name}`,
          fieldSelector: null,
          limit: null,
          statusFilter: null,
        });
        return allPods;
      } catch {
        return [];
      }
    },
    enabled: !!namespace && !!name,
    placeholderData: keepPreviousData,
    staleTime: 10000,
    refetchInterval: 15000,
  });

  if (!statefulSet && !isLoading && !error) {
    return null;
  }

  const isReady =
    statefulSet?.replicas.ready === statefulSet?.replicas.desired;
  const statusVariant = isReady ? "success" : "warning";
  const statusText = isReady ? "Ready" : "Updating";

  const tabs = [
    {
      id: "overview",
      label: "Overview",
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoCard title="StatefulSet Info" icon={<Database className="h-4 w-4" />}>
              <div className="space-y-1">
                <InfoRow
                  label="Service Name"
                  value={statefulSet?.serviceName || "-"}
                />
                <InfoRow
                  label="Pod Management"
                  value={statefulSet?.podManagementPolicy || "OrderedReady"}
                />
                <InfoRow
                  label="Update Strategy"
                  value={statefulSet?.updateStrategy || "RollingUpdate"}
                />
                <InfoRow
                  label="Created"
                  value={
                    statefulSet?.createdAt
                      ? formatAge(statefulSet.createdAt)
                      : "-"
                  }
                />
              </div>
            </InfoCard>

            <InfoCard title="Replicas">
              <div className="space-y-1">
                <InfoRow
                  label="Desired"
                  value={statefulSet?.replicas.desired ?? 0}
                />
                <InfoRow
                  label="Current"
                  value={statefulSet?.replicas.current ?? 0}
                />
                <InfoRow
                  label="Ready"
                  value={statefulSet?.replicas.ready ?? 0}
                />
              </div>
            </InfoCard>
          </div>

          <LabelsDisplay labels={statefulSet?.labels || {}} title="Labels" />
        </div>
      ),
    },
    {
      id: "containers",
      label: "Containers",
      content: (
        <div className="space-y-4">
          {(statefulSet?.containers || []).map((container) => (
            <Card key={container.name}>
              <CardHeader>
                <CardTitle className="text-lg">{container.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Image</span>
                    <span className="font-mono text-xs">{container.image}</span>
                  </div>
                  {container.ports.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ports</span>
                      <span>{container.ports.join(", ")}</span>
                    </div>
                  )}
                  {container.resources.requests &&
                    Object.keys(container.resources.requests).length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Requests</span>
                        <span>
                          {Object.entries(container.resources.requests)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(", ")}
                        </span>
                      </div>
                    )}
                  {container.resources.limits &&
                    Object.keys(container.resources.limits).length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Limits</span>
                        <span>
                          {Object.entries(container.resources.limits)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(", ")}
                        </span>
                      </div>
                    )}
                </div>

                {/* Environment Variables */}
                {(container.env.length > 0 || container.envFrom.length > 0) && (
                  <EnvironmentVariables
                    env={container.env}
                    envFrom={container.envFrom}
                    containerName={container.name}
                  />
                )}
              </CardContent>
            </Card>
          ))}
          {(!statefulSet?.containers || statefulSet.containers.length === 0) && (
            <p className="text-center text-muted-foreground py-8">
              No containers defined
            </p>
          )}
        </div>
      ),
    },
    {
      id: toPlural(ResourceType.Pod),
      label: "Pods",
      content: (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              {pods.map((pod) => {
                const readyCount =
                  pod.containers?.filter((c) => c.ready).length ?? 0;
                const totalCount = pod.containers?.length ?? 0;
                const readyText = `${readyCount}/${totalCount}`;
                const status = pod.status?.phase || "Unknown";
                const age = formatAge(pod.createdAt);

                return (
                  <Link
                    key={pod.name}
                    to={`/${toPlural(ResourceType.Pod)}/${pod.namespace}/${pod.name}`}
                    className="flex items-center justify-between p-3 rounded-md hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          status === "Running"
                            ? "success"
                            : status === "Pending"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {status}
                      </Badge>
                      <span className="font-medium">{pod.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Ready: {readyText}</span>
                      <span>Restarts: {pod.restartCount ?? 0}</span>
                      <span>{age}</span>
                    </div>
                  </Link>
                );
              })}
              {pods.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  No pods found
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ),
    },
    {
      id: "yaml",
      label: "YAML",
      content: <YamlTabContent
        yaml={yaml}
        onCopy={copyYaml}
        title={statefulSet?.name || "StatefulSet YAML"}
        resourceKind={ResourceType.StatefulSet}
        resourceName={statefulSet?.name || name || ""}
        namespace={statefulSet?.namespace || namespace}
      />,
    },
    {
      id: "conditions",
      label: "Conditions",
      content: (
        <ConditionsDisplay
          conditions={statefulSet?.conditions || []}
        />
      ),
    },
  ];

  return (
    <ResourceDetailLayout
      resource={statefulSet}
      isLoading={isLoading}
      isFetching={isFetching}
      error={error}
      resourceKind="StatefulSet"
      title={name || ""}
      namespace={namespace}
      statusBadge={<Badge variant={statusVariant}>{statusText}</Badge>}
      badges={
        <>
          <Badge variant="outline">
            {statefulSet?.replicas.ready ?? 0}/{statefulSet?.replicas.desired ?? 0} ready
          </Badge>
        </>
      }
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => deleteMutation?.mutate()}
            disabled={deleteMutation?.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </>
      }
      icon={<Database className="h-5 w-5" />}
      onBack={goBack}
      onRefresh={refetch}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      labels={statefulSet?.labels}
      annotations={statefulSet?.annotations}
    />
  );
}
