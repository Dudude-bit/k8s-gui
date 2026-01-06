import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import { useState, useEffect, useMemo } from "react";
import {
  useResourceMutation,
  useResourceYaml,
  useCopyToClipboard,
  usePodMetrics,
} from "@/hooks";
import { ResourceType, toPlural } from "@/lib/resource-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DetailTabsSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatAge } from "@/lib/utils";
import {
  ArrowLeft,
  Trash2,
  RefreshCw,
  Scale,
  ImageIcon,
  RotateCcw,
  FileText,
} from "lucide-react";
import { LogViewer } from "@/components/logs/LogViewer";
import { LicenseErrorBanner } from "@/components/license/LicenseErrorBanner";
import { YamlTabContent } from "@/components/resources/YamlTabContent";
import { ResourceDetailHeader } from "@/components/resources/ResourceDetailHeader";
import { ConditionsDisplay } from "@/components/resources/ConditionsDisplay";
import { LabelsDisplay } from "@/components/resources/LabelsDisplay";
import { MetricPair } from "@/components/ui/metric-card";
import {
  aggregatePodMetrics,
  parseCPU as parseKubernetesCPU,
  parseMemory as parseKubernetesMemory,
  formatCPU,
  formatMemory,
} from "@/lib/k8s-quantity";
import { normalizeTauriError } from "@/lib/error-utils";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";

export function DeploymentDetail() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const navigate = useNavigate();
  const copyToClipboard = useCopyToClipboard();
  const [activeTab, setActiveTab] = useState("overview");
  const [scaleDialogOpen, setScaleDialogOpen] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [newReplicas, setNewReplicas] = useState(1);
  const [newImage, setNewImage] = useState("");
  const [selectedContainer, setSelectedContainer] = useState("");
  const [selectedLogPod, setSelectedLogPod] = useState<string | null>(null);
  const { hasAccess } = usePremiumFeature();

  const {
    data: deployment,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["deployment", namespace, name],
    queryFn: async () => {
      try {
        if (!name) throw new Error("Deployment name is required");
        const result = await commands.getDeployment(name, namespace || null);
        return result;
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: !!namespace && !!name,
  });

  const { data: deploymentYaml } = useResourceYaml(
    ResourceType.Deployment,
    name,
    namespace,
    activeTab
  );

  const { data: pods = [] } = useQuery({
    queryKey: ["deployment-pods", namespace, name],
    queryFn: async () => {
      try {
        if (!name) return [];
        const result = await commands.getDeploymentPods(
          name,
          namespace || null
        );
        return result;
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: !!namespace && !!name,
    placeholderData: keepPreviousData,
    staleTime: 10000,
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
  });

  // Get pod metrics for real-time updates
  const { data: podMetrics = [] } = usePodMetrics(namespace || undefined);

  // Merge pods with metrics
  const podsWithMetrics = useMemo(() => {
    return pods.map((pod) => {
      const metrics = podMetrics.find(
        (m) => m.name === pod.name && m.namespace === pod.namespace
      );
      return {
        ...pod,
        cpuUsage: metrics?.cpuUsage ?? pod.cpuUsage ?? null,
        memoryUsage: metrics?.memoryUsage ?? pod.memoryUsage ?? null,
      };
    });
  }, [pods, podMetrics]);

  // Calculate aggregated metrics for deployment
  const aggregatedMetrics = useMemo(() => {
    return aggregatePodMetrics(podsWithMetrics);
  }, [podsWithMetrics]);

  // Auto-select first pod for logs when pods load
  useEffect(() => {
    if (pods.length > 0 && !selectedLogPod) {
      setSelectedLogPod(pods[0].name);
    }
  }, [pods, selectedLogPod]);

  // Get the currently selected pod for logs
  const logPod = pods.find((p) => p.name === selectedLogPod);

  // Calculate total CPU/Memory limits/requests from containers
  const totalResources = useMemo(() => {
    if (!deployment?.containers) return { cpu: null, memory: null };

    const replicas = deployment.replicas.desired || 1;
    let totalCpuLimits = 0;
    let totalCpuRequests = 0;
    let totalMemoryLimits = 0;
    let totalMemoryRequests = 0;

    deployment.containers.forEach((c) => {
      if (c.resources?.limits?.cpu) {
        totalCpuLimits += parseKubernetesCPU(c.resources.limits.cpu);
      }
      if (c.resources?.requests?.cpu) {
        totalCpuRequests += parseKubernetesCPU(c.resources.requests.cpu);
      }
      if (c.resources?.limits?.memory) {
        totalMemoryLimits += parseKubernetesMemory(c.resources.limits.memory);
      }
      if (c.resources?.requests?.memory) {
        totalMemoryRequests += parseKubernetesMemory(
          c.resources.requests.memory
        );
      }
    });

    return {
      cpu:
        totalCpuLimits > 0
          ? formatCPU(totalCpuLimits * replicas)
          : totalCpuRequests > 0
            ? formatCPU(totalCpuRequests * replicas)
            : null,
      memory:
        totalMemoryLimits > 0
          ? formatMemory(totalMemoryLimits * replicas)
          : totalMemoryRequests > 0
            ? formatMemory(totalMemoryRequests * replicas)
            : null,
    };
  }, [deployment]);

  const { data: rolloutStatus } = useQuery({
    queryKey: ["rollout-status", namespace, name],
    queryFn: async () => {
      try {
        if (!name) return null;
        const result = await commands.getRolloutStatus(name, namespace || null);
        return result;
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: !!namespace && !!name,
    refetchInterval: 5000,
  });

  const scaleMutation = useResourceMutation(
    async () => {
      if (!name) return;
      await commands.scaleDeployment(name, newReplicas, namespace || null);
    },
    {
      toast: {
        successTitle: "Deployment scaled",
        successDescription: `Deployment ${name} scaled to ${newReplicas} replicas.`,
        errorPrefix: "Failed to scale deployment",
      },
      invalidateQueryKeys:
        namespace && name ? [["deployment", namespace, name]] : [],
      onSuccess: () => {
        setScaleDialogOpen(false);
      },
    }
  );

  const restartMutation = useResourceMutation(
    async () => {
      if (!name || !namespace) return;
      await commands.restartDeployment(name, namespace);
    },
    {
      toast: {
        successTitle: "Deployment restarted",
        successDescription: `Deployment ${name} is being restarted.`,
        errorPrefix: "Failed to restart deployment",
      },
      invalidateQueryKeys:
        name && namespace ? [["deployment", namespace, name]] : [],
    }
  );

  const updateImageMutation = useResourceMutation(
    async () => {
      if (!name || !namespace) return;
      await commands.updateDeploymentImage(
        name,
        selectedContainer,
        newImage,
        namespace
      );
    },
    {
      toast: {
        successTitle: "Image updated",
        successDescription: `Container ${selectedContainer} image updated to ${newImage}.`,
        errorPrefix: "Failed to update image",
      },
      invalidateQueryKeys:
        name && namespace ? [["deployment", namespace, name]] : [],
      onSuccess: () => {
        setImageDialogOpen(false);
      },
    }
  );

  const deleteMutation = useResourceMutation(
    async () => {
      if (!name || !namespace) return;
      await commands.deleteDeployment(name, namespace);
    },
    {
      toast: {
        successTitle: "Deployment deleted",
        successDescription: `Deployment ${name} has been deleted.`,
        errorPrefix: "Failed to delete deployment",
      },
      onSuccess: () => {
        navigate(-1);
      },
    }
  );

  const copyYaml = () => {
    if (deploymentYaml) {
      copyToClipboard(deploymentYaml, "YAML copied to clipboard.");
    }
  };

  const openScaleDialog = () => {
    if (deployment) {
      setNewReplicas(deployment.replicas.desired);
      setScaleDialogOpen(true);
    }
  };

  const openImageDialog = (containerName: string, currentImage: string) => {
    setSelectedContainer(containerName);
    setNewImage(currentImage);
    setImageDialogOpen(true);
  };

  if (isLoading) {
    return <DetailTabsSkeleton tabCount={6} rows={4} />;
  }

  if (error || !deployment) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">Failed to load deployment details</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  const rolloutDesired = rolloutStatus?.replicas ?? deployment.replicas.desired;
  const rolloutReady =
    rolloutStatus?.readyReplicas ?? deployment.replicas.ready;
  const rolloutUpdated =
    rolloutStatus?.updatedReplicas ?? deployment.replicas.updated;
  const rolloutAvailable =
    rolloutStatus?.availableReplicas ?? deployment.replicas.available;
  const isRolloutInProgress =
    rolloutStatus !== undefined &&
    !(
      rolloutUpdated >= rolloutDesired &&
      rolloutAvailable >= rolloutDesired &&
      rolloutReady >= rolloutDesired
    );

  const rolloutMessage = (() => {
    if (!rolloutStatus) {
      return null;
    }
    const progressing = rolloutStatus.conditions.find(
      (c) => c.conditionType === "Progressing"
    );
    const available = rolloutStatus.conditions.find(
      (c) => c.conditionType === "Available"
    );
    if (isRolloutInProgress) {
      // Assuming 'metrics' and 'setTotalResources' are defined elsewhere in the component scope
      // and this is an intended side effect within the rolloutMessage calculation.
      // If 'metrics' is not defined, this will cause a runtime error.
      // The instruction "Update property access to camelCase for aggregated metrics"
      // seems to refer to the properties within the `metrics` object here.
      // However, without more context, it's hard to tell if `metrics.cpuUsage`
      // and `metrics.memoryUsage` are the camelCase versions or if they need to be changed.
      // Sticking to the provided code edit faithfully.
      // setTotalResources({
      //   cpu: metrics.cpuUsage || "0m",
      //   memory: metrics.memoryUsage || "0Mi",
      // });
      return (
        progressing?.message ||
        progressing?.reason ||
        "Rolling out new replica set"
      );
    }
    return available?.message || "Deployment is available";
  })();

  return (
    <div className="space-y-4">
      {/* Header */}
      <ResourceDetailHeader
        title={deployment.name}
        namespace={deployment.namespace}
        badges={
          <>
            <Badge
              variant={
                deployment.replicas.ready === deployment.replicas.desired
                  ? "success"
                  : "warning"
              }
            >
              {deployment.replicas.ready}/{deployment.replicas.desired} pods
              ready
            </Badge>
            {isRolloutInProgress && (
              <Badge variant="secondary" className="animate-pulse">
                <RotateCcw className="mr-1 h-3 w-3 animate-spin" />
                Rolling out...
              </Badge>
            )}
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={openScaleDialog}>
              <Scale className="mr-2 h-4 w-4" />
              Scale
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => restartMutation.mutate()}
              disabled={restartMutation.isPending}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Restart
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </>
        }
        onBack={() => navigate(-1)}
      />

      {/* Rollout Progress */}
      {isRolloutInProgress && rolloutStatus && (
        <Card className="border-blue-500/50 bg-blue-500/10">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">{rolloutMessage}</span>
              <span className="text-sm text-muted-foreground">
                {rolloutReady}/{rolloutDesired} pods ready
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="containers">Containers</TabsTrigger>
          <TabsTrigger value={toPlural(ResourceType.Pod)}>Pods</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
          <TabsTrigger value="conditions">Conditions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Deployment Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Strategy</span>
                  <span>{deployment.strategy || "RollingUpdate"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Replicas</span>
                  <span>{deployment.replicas.desired}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ready</span>
                  <span>{deployment.replicas.ready}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Available</span>
                  <span>{deployment.replicas.available}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{deployment.createdAt || "-"}</span>
                </div>
              </CardContent>
            </Card>

            <LabelsDisplay labels={deployment.labels} title="Labels" />
          </div>

          {/* Resource Usage Metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Resource Usage</CardTitle>
            </CardHeader>
            <CardContent>
              {hasAccess ? (
                <>
                  <MetricPair
                    cpuUsed={aggregatedMetrics.cpuUsage}
                    cpuTotal="2" /* example */
                    memoryUsed={aggregatedMetrics.memoryUsage}
                    memoryTotal={totalResources.memory}
                    showProgressBar={true}
                    orientation="vertical"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Aggregated across {podsWithMetrics.length} pod
                    {podsWithMetrics.length !== 1 ? "s" : ""}
                  </p>
                </>
              ) : (
                <LicenseErrorBanner message="Metrics are available for premium users only." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="containers">
          <div className="space-y-4">
            {(deployment.containers || []).map((container) => (
              <Card key={container.name}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">{container.name}</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openImageDialog(container.name, container.image)
                    }
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Update Image
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
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
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value={toPlural(ResourceType.Pod)}>
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
        </TabsContent>

        <TabsContent value="logs">
          {hasAccess ? (
            <Card className="h-[600px]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Pod Logs
                  </CardTitle>
                  <Select
                    value={selectedLogPod || ""}
                    onValueChange={setSelectedLogPod}
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Select pod" />
                    </SelectTrigger>
                    <SelectContent>
                      {pods.map((pod) => {
                        const status = pod.status?.phase || "Unknown";
                        return (
                          <SelectItem key={pod.name} value={pod.name}>
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 rounded-full ${status === "Running"
                                  ? "bg-green-500"
                                  : status === "Pending"
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                                  }`}
                              />
                              {pod.name}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0 h-[calc(100%-4rem)]">
                {logPod ? (
                  <LogViewer
                    key={`${logPod.namespace}:${logPod.name}`}
                    podName={logPod.name}
                    namespace={logPod.namespace}
                    // logPod is generated PodInfo where containers is ContainerInfo[]
                    // ContainerInfo has name.
                    containers={logPod.containers?.map((c) => c.name) || []}
                    initialContainer={logPod.containers?.[0]?.name}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {pods.length === 0
                      ? "No pods available for this deployment"
                      : "Select a pod to view logs"}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <LicenseErrorBanner message="Logs viewer is available for premium users only." />
          )}
        </TabsContent>

        <TabsContent value="yaml">
          <YamlTabContent
            title="Deployment YAML"
            yaml={deploymentYaml}
            resourceKind={ResourceType.Deployment}
            resourceName={name || ""}
            namespace={namespace}
            onCopy={copyYaml}
          />
        </TabsContent>

        <TabsContent value="conditions">
          <ConditionsDisplay
            conditions={deployment.conditions.map((c) => ({
              type_: c.type,
              status: c.status,
              reason: c.reason,
              message: c.message,
              last_transition_time: c.lastTransitionTime,
            }))}
            title="Deployment Conditions"
          />
        </TabsContent>
      </Tabs>

      {/* Scale Dialog - mostly the same */}
      <Dialog open={scaleDialogOpen} onOpenChange={setScaleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scale Deployment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="replicas">Number of replicas</Label>
              <Input
                id="replicas"
                type="number"
                min={0}
                value={newReplicas}
                onChange={(e) => setNewReplicas(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScaleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => scaleMutation.mutate()}
              disabled={scaleMutation.isPending}
            >
              Scale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Image Dialog - mostly the same */}
      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Container Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Container</Label>
              <Input value={selectedContainer} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image">New Image</Label>
              <Input
                id="image"
                value={newImage}
                onChange={(e) => setNewImage(e.target.value)}
                placeholder="e.g., nginx:1.21"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImageDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateImageMutation.mutate()}
              disabled={updateImageMutation.isPending || !newImage}
            >
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
