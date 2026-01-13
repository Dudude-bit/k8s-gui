import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/commands";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useMetrics, useResourceDetail, useClusterInfo } from "@/hooks";
import { mergePodsWithMetrics } from "@/lib/metrics";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { useClusterStore } from "@/stores/clusterStore";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { LicenseErrorBanner } from "@/components/license/LicenseErrorBanner";
import { MetricsStatusBanner } from "@/components/metrics";
import type { PodInfo, DebugResult } from "@/generated/types";
import { DebugPodDialog } from "@/components/debug";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Lock, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogViewer } from "@/components/logs/LogViewer";
import { Terminal } from "@/components/terminal/Terminal";
import { YamlTabContent } from "@/components/resources/YamlTabContent";
import { LabelsDisplay } from "@/components/resources/LabelsDisplay";
import { ConditionsDisplay } from "@/components/resources/ConditionsDisplay";
import { ContainerCard } from "@/components/resources/ContainerCard";
import { RelatedResources } from "@/components/resources/RelatedResources";
import { ResourceDetailLayout, InfoCard, InfoRow } from "@/components/resources/ResourceDetailLayout";
import { useToast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch";
import { usePortForwardStore } from "@/stores/portForwardStore";
import {
  RefreshCw,
  Activity,
  Trash2,
  Server,
} from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { normalizeTauriError } from "@/lib/error-utils";
import { parseCPU, parseMemory } from "@/lib/k8s-quantity";

const parsePortValue = (value: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return null;
  }
  return parsed;
};

interface PortForwardFormState {
  name: string;
  localPort: string;
  remotePort: string;
  autoReconnect: boolean;
  autoStart: boolean;
  saveConfig: boolean;
}

export function PodDetail() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentContext } = useClusterStore();
  const { hasAccess: hasLicenseAccess, checkLicense } = usePremiumFeature();
  const queryClient = useQueryClient();
  const addPortForwardConfig = usePortForwardStore((state) => state.addConfig);
  const startPortForwardConfig = usePortForwardStore(
    (state) => state.startConfig
  );
  const refreshPortForwards = usePortForwardStore(
    (state) => state.refreshSessions
  );
  const portForwardSessions = usePortForwardStore((state) => state.sessions);
  const stopPortForwardSession = usePortForwardStore(
    (state) => state.stopSession
  );
  const portForwardStatusBySession = usePortForwardStore(
    (state) => state.statusBySession
  );
  // Fetch cluster info for K8s version detection
  const { data: clusterInfo } = useClusterInfo();

  const [showTerminal, setShowTerminal] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<string | null>(
    null
  );
  const [isSearchingReplacement, setIsSearchingReplacement] = useState(false);
  const [savedLabels, setSavedLabels] = useState<Record<string, string> | null>(
    null
  );
  const [portForwardOpen, setPortForwardOpen] = useState(false);
  const [portForwardBusy, setPortForwardBusy] = useState(false);
  const [debugDialogOpen, setDebugDialogOpen] = useState(false);
  const [portForwardForm, setPortForwardForm] = useState<PortForwardFormState>({
    name: "",
    localPort: "",
    remotePort: "",
    autoReconnect: true,
    autoStart: false,
    saveConfig: true,
  });

  const {
    resource: pod,
    isLoading,
    error,
    name,
    namespace,
    yaml,
    activeTab,
    setActiveTab,
    refetch,
    copyYaml,
    deleteMutation
  } = useResourceDetail<PodInfo>({
    resourceKind: ResourceType.Pod,
    fetchResource: (name, namespace) => commands.getPod(name, namespace),
    deleteResource: (name, namespace) => commands.deletePod(name, namespace, null),
  });

  useEffect(() => {
    if (pod?.labels && Object.keys(pod.labels).length > 0) {
      setSavedLabels(pod.labels);
    }
  }, [pod]);

  const { podMetrics, podStatus } = useMetrics({
    namespace: namespace || null,
    includeNodes: false,
    includeCluster: false,
    enabled: !!pod,
  });

  const podWithMetrics = useMemo(() => {
    if (!pod) return null;
    return mergePodsWithMetrics([pod], podMetrics)[0] ?? null;
  }, [pod, podMetrics]);

  // Find replacement pod by labels
  const findReplacementPod = useCallback(
    async (labelsToUse?: Record<string, string>) => {
      const labels = labelsToUse || savedLabels;

      if (!labels || !namespace) {
        return null;
      }

      setIsSearchingReplacement(true);

      try {
        // Build label selector from pod's labels (use app/component labels)
        // Also include pod-template-hash for deployments
        const importantLabels = [
          "app",
          "app.kubernetes.io/name",
          "app.kubernetes.io/instance",
          "component",
          "pod-template-hash",
        ];
        const labelParts: string[] = [];

        for (const label of importantLabels) {
          if (labels[label]) {
            labelParts.push(`${label}=${labels[label]}`);
          }
        }

        if (labelParts.length === 0) {
          setIsSearchingReplacement(false);
          return null;
        }

        const labelSelector = labelParts.join(",");

        const pods = await commands.listPods({
          namespace,
          labelSelector: labelSelector,
          fieldSelector: null,
          limit: null,
          statusFilter: null,
        });

        // Find a running pod that's not the current one
        // status.phase is the phase string (Running, Pending, etc.)
        const replacement = pods.find(
          (p) => p.name !== name && p.status.phase === "Running"
        );

        return replacement || null;
      } catch (err) {
        console.error("Failed to find replacement pod:", err);
        return null;
      } finally {
        setIsSearchingReplacement(false);
      }
    },
    [savedLabels, namespace, name]
  );

  const restartMutation = useMutation({
    mutationFn: async () => {
      if (!name) return;
      try {
        await commands.restartPod(name, namespace || null);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    onSuccess: () => {
      toast({
        title: "Pod restarted",
        description: `Pod ${name} is being restarted.`,
      });
      queryClient.invalidateQueries({ queryKey: ["pod", namespace, name] });
      refetch();
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: `Failed to restart pod: ${err}`,
        variant: "destructive",
      });
    },
  });

  const openTerminal = async (containerName: string) => {
    if (!hasLicenseAccess) {
      const hasAccess = await checkLicense();
      if (!hasAccess) {
        toast({
          title: "Premium Feature",
          description:
            "Terminal access requires a premium license. Please activate your license.",
          variant: "destructive",
        });
        return;
      }
    }
    setSelectedContainer(containerName);
    setShowTerminal(true);
  };

  const handleDebugStart = async (result: DebugResult) => {
    if (result.isNewPod) {
      // Navigate to the new debug pod
      navigate(
        `/${toPlural(ResourceType.Pod)}/${result.namespace}/${result.podName}`,
        { replace: false }
      );
    } else {
      // Open terminal to the debug container in the current pod
      setSelectedContainer(result.containerName);
      setShowTerminal(true);
    }
  };

  const openDebugDialog = async () => {
    if (!pod) return;
    if (!hasLicenseAccess) {
      const hasAccess = await checkLicense();
      if (!hasAccess) {
        toast({
          title: "Premium Feature",
          description:
            "Debug requires a premium license. Please activate your license.",
          variant: "destructive",
        });
        return;
      }
    }
    setDebugDialogOpen(true);
  };

  const openPortForwardDialog = async () => {
    if (!pod) {
      return;
    }
    if (!hasLicenseAccess) {
      const hasAccess = await checkLicense();
      if (!hasAccess) {
        toast({
          title: "Premium Feature",
          description:
            "Port forwarding requires a premium license. Please activate your license.",
          variant: "destructive",
        });
        return;
      }
    }
    setPortForwardForm({
      name: pod.name,
      localPort: "",
      remotePort: "",
      autoReconnect: true,
      autoStart: false,
      saveConfig: true,
    });
    setPortForwardOpen(true);
  };

  const handlePortForward = async () => {
    if (!pod) {
      return;
    }
    if (!currentContext) {
      toast({
        title: "No cluster selected",
        description: "Connect to a cluster to start port-forwarding.",
        variant: "destructive",
      });
      return;
    }

    const localPort = parsePortValue(portForwardForm.localPort);
    const remotePort = parsePortValue(portForwardForm.remotePort);

    if (!localPort || !remotePort) {
      toast({
        title: "Invalid port",
        description: "Ports must be between 1 and 65535.",
        variant: "destructive",
      });
      return;
    }

    setPortForwardBusy(true);
    try {
      if (portForwardForm.saveConfig) {
        const config = await addPortForwardConfig({
          context: currentContext,
          name: portForwardForm.name.trim() || `${pod.name}:${remotePort}`,
          pod: pod.name,
          namespace: pod.namespace,
          localPort,
          remotePort,
          autoReconnect: portForwardForm.autoReconnect,
          autoStart: portForwardForm.autoStart,
        });
        await startPortForwardConfig(config.id);
      } else {
        await commands.portForwardPod(pod.name, pod.namespace, {
          localPort: localPort,
          remotePort: remotePort,
          autoReconnect: portForwardForm.autoReconnect,
        });
      }

      await refreshPortForwards();
      setPortForwardOpen(false);
    } catch (err) {
      toast({
        title: "Failed to start port-forward",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setPortForwardBusy(false);
    }
  };

  const handleStopPortForward = async (sessionId: string) => {
    try {
      await stopPortForwardSession(sessionId);
    } catch (err) {
      toast({
        title: "Failed to stop port-forward",
        description: String(err),
        variant: "destructive",
      });
    }
  };

  const activePortForwards =
    pod && portForwardSessions
      ? portForwardSessions.filter(
        (session) =>
          session.context === currentContext &&
          session.pod === pod.name &&
          session.namespace === pod.namespace
      )
      : [];

  return (
    <ResourceDetailLayout
      resource={pod}
      isLoading={isLoading}
      error={error}
      resourceKind={ResourceType.Pod}
      title={pod?.name || name || "Pod"}
      namespace={pod?.namespace || namespace}
      onBack={() => navigate(-1)}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      badges={pod?.status.phase ? <StatusBadge status={pod.status.phase} /> : null}

      // Replacement Pod Logic
      onFindReplacement={savedLabels ? () =>
        findReplacementPod().then((replacement) => {
          if (replacement) {
            toast({
              title: "Found replacement pod",
              description: `Switching to ${replacement.name}`,
            });
            navigate(
              `/${toPlural(ResourceType.Pod)}/${replacement.namespace}/${replacement.name}`,
              { replace: true }
            );
          } else {
            toast({
              title: "No replacement found",
              description: "No other running pods with matching labels",
              variant: "destructive",
            });
          }
        })
        : undefined
      }
      isSearchingReplacement={isSearchingReplacement}

      actions={
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openDebugDialog}
                  disabled={!currentContext || !hasLicenseAccess || !pod}
                >
                  {!hasLicenseAccess && <Lock className="mr-2 h-4 w-4" />}
                  <Bug className="mr-2 h-4 w-4" />
                  Debug
                </Button>
              </span>
            </TooltipTrigger>
            {!hasLicenseAccess && (
              <TooltipContent>
                Premium feature - requires license
              </TooltipContent>
            )}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openPortForwardDialog}
                  disabled={!currentContext || !hasLicenseAccess || !pod}
                >
                  {!hasLicenseAccess && <Lock className="mr-2 h-4 w-4" />}
                  Port Forward
                </Button>
              </span>
            </TooltipTrigger>
            {!hasLicenseAccess && (
              <TooltipContent>
                Premium feature - requires license
              </TooltipContent>
            )}
          </Tooltip>
          <Button
            variant="outline"
            size="sm"
            onClick={() => restartMutation.mutate()}
            disabled={restartMutation.isPending || !pod}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", restartMutation.isPending && "animate-spin")} />
            Restart
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => deleteMutation?.mutate()}
            disabled={deleteMutation?.isPending || !pod}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </>
      }
      tabs={[
        {
          id: "overview",
          label: "Overview",
          content: (
            <div className="space-y-4">
              {/* Labels and Annotations */}
              {pod && <LabelsDisplay labels={pod.labels} className="col-span-full" />}
            </div>
          )
        },
        {
          id: "containers",
          label: "Containers",
          content: pod ? (
            <div className="space-y-4">
              {pod.containers.map((container) => (
                <ContainerCard
                  key={container.name}
                  container={container}
                  namespace={namespace}
                  podName={pod.name}
                  showShell={true}
                  hasLicense={hasLicenseAccess}
                  onOpenShell={openTerminal}
                />
              ))}
            </div>
          ) : null
        },
        {
          id: "logs",
          label: "Logs",
          content: pod ? (hasLicenseAccess ? (
            <div className="h-[70vh] min-h-[400px]">
              <LogViewer
                podName={pod.name}
                namespace={pod.namespace}
                containers={pod.containers.map((c) => c.name)}
              />
            </div>
          ) : (
            <LicenseErrorBanner message="Logs are available for premium users only." />
          )) : null
        },
        {
          id: "yaml",
          label: "YAML",
          content: <YamlTabContent
            yaml={yaml}
            onCopy={copyYaml}
            title={pod?.name || "Pod YAML"}
            resourceKind={ResourceType.Pod}
            resourceName={pod?.name || name || ""}
            namespace={pod?.namespace || namespace}
          />
        },
        {
          id: "conditions",
          label: "Conditions",
          content: <ConditionsDisplay
            conditions={pod?.status.conditions || []}
          />
        }
      ]}
    >
      {hasLicenseAccess && podStatus?.status !== "available" && (
        <MetricsStatusBanner status={podStatus} />
      )}
      {/* Top Content: Info Cards and Metrics */}
      {pod && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Pod Info */}
          <InfoCard title="Info" icon={<Server className="h-4 w-4" />}>
            <InfoRow label="Node" value={pod.nodeName || "-"} />
            <InfoRow label="Pod IP" value={pod.podIp || "-"} />
            <InfoRow label="Host IP" value={pod.hostIp || "-"} />
          </InfoCard>

          <InfoCard title="Status" icon={<Activity className="h-4 w-4" />}>
            <InfoRow label="Phase" value={pod.status.phase} />
            <InfoRow
              label="Started"
              value={pod.createdAt ? new Date(pod.createdAt).toLocaleString() : "-"}
            />
            <InfoRow label="Restart Count" value={pod.restartCount} />
          </InfoCard>

          {/* Metrics */}
          {hasLicenseAccess ? (
            podWithMetrics && (
              <>
                <MetricCard
                  title="CPU Usage"
                  used={podWithMetrics.cpuMillicores}
                  total={
                    podWithMetrics.cpuLimits
                      ? parseCPU(podWithMetrics.cpuLimits)
                      : podWithMetrics.cpuRequests
                        ? parseCPU(podWithMetrics.cpuRequests)
                        : null
                  }
                  type="cpu"
                  showProgressBar
                />

                <MetricCard
                  title="Memory Usage"
                  used={podWithMetrics.memoryBytes}
                  total={
                    podWithMetrics.memoryLimits
                      ? parseMemory(podWithMetrics.memoryLimits)
                      : podWithMetrics.memoryRequests
                        ? parseMemory(podWithMetrics.memoryRequests)
                        : null
                  }
                  type="memory"
                  showProgressBar
                />
              </>
            )
          ) : (
            <div className="col-span-2">
              {/* We could show a banner here or just skip metrics in top cards */}
              <Card className="h-full flex items-center justify-center p-4 bg-muted/20 border-dashed">
                <div className="text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <Lock className="h-4 w-4" />
                  <span>Metrics available with Premium</span>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Related Resources (Owner References) */}
      {pod && (
        <RelatedResources
          ownerReferences={pod.ownerReferences}
          namespace={pod.namespace}
        />
      )}

      {/* Port Forward & Terminal Dialogs/Panels */}
      <Dialog open={portForwardOpen} onOpenChange={setPortForwardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Port forward</DialogTitle>
            <DialogDescription>
              Forward traffic from your machine to this pod.
            </DialogDescription>
          </DialogHeader>
          {pod && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Target</span>
                  <span className="font-medium">
                    {pod.namespace}/{pod.name}
                  </span>
                </div>
              </div>

              {/* Port Presets from Container Ports */}
              {(() => {
                const allPorts = pod.containers.flatMap((container) =>
                  container.ports.map((port) => ({
                    containerName: container.name,
                    port: port.containerPort,
                    name: port.name,
                    protocol: port.protocol,
                  }))
                );

                if (allPorts.length === 0) return null;

                return (
                  <div className="space-y-2">
                    <Label>Quick presets</Label>
                    <div className="flex flex-wrap gap-2">
                      {allPorts.map((p, idx) => (
                        <Button
                          key={`${p.containerName}-${p.port}-${idx}`}
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setPortForwardForm((prev) => ({
                              ...prev,
                              localPort: String(p.port),
                              remotePort: String(p.port),
                              name: p.name || `${pod.name}:${p.port}`,
                            }))
                          }
                        >
                          {p.name ? `${p.name} (${p.port})` : String(p.port)}
                          <span className="ml-1 text-xs text-muted-foreground">
                            {p.protocol}
                          </span>
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Click to auto-fill local and remote ports
                    </p>
                  </div>
                );
              })()}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="pf-local-port">Local port</Label>
                  <Input
                    id="pf-local-port"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={65535}
                    value={portForwardForm.localPort}
                    onChange={(event) =>
                      setPortForwardForm((prev) => ({
                        ...prev,
                        localPort: event.target.value,
                      }))
                    }
                    placeholder="8080"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pf-remote-port">Remote port</Label>
                  <Input
                    id="pf-remote-port"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={65535}
                    value={portForwardForm.remotePort}
                    onChange={(event) =>
                      setPortForwardForm((prev) => ({
                        ...prev,
                        remotePort: event.target.value,
                      }))
                    }
                    placeholder="80"
                  />
                </div>
              </div>
              <div className="rounded-md border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Auto reconnect</p>
                    <p className="text-xs text-muted-foreground">
                      Retry when the pod or connection drops
                    </p>
                  </div>
                  <Switch
                    checked={portForwardForm.autoReconnect}
                    onCheckedChange={(checked) =>
                      setPortForwardForm((prev) => ({
                        ...prev,
                        autoReconnect: checked,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Save as config</p>
                    <p className="text-xs text-muted-foreground">
                      Keep this port-forward for quick reuse
                    </p>
                  </div>
                  <Switch
                    checked={portForwardForm.saveConfig}
                    onCheckedChange={(checked) =>
                      setPortForwardForm((prev) => ({
                        ...prev,
                        saveConfig: checked,
                      }))
                    }
                  />
                </div>
                {portForwardForm.saveConfig && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Auto start</p>
                        <p className="text-xs text-muted-foreground">
                          Start automatically when this cluster connects
                        </p>
                      </div>
                      <Switch
                        checked={portForwardForm.autoStart}
                        onCheckedChange={(checked) =>
                          setPortForwardForm((prev) => ({
                            ...prev,
                            autoStart: checked,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pf-config-name">Config name</Label>
                      <Input
                        id="pf-config-name"
                        value={portForwardForm.name}
                        onChange={(event) =>
                          setPortForwardForm((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }))
                        }
                        placeholder={pod.name}
                      />
                    </div>
                  </div>
                )}
              </div>
              {activePortForwards.length > 0 && (
                <div className="space-y-2">
                  <Label>Active port-forwards</Label>
                  {activePortForwards.map((session) => (
                    <div
                      key={session.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
                    >
                      <div>
                        <div className="font-medium">
                          {session.localPort} → {session.pod}:{session.remotePort}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {portForwardStatusBySession[session.id]?.message ||
                            portForwardStatusBySession[session.id]?.status ||
                            "Active"}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStopPortForward(session.id)}
                      >
                        Stop
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPortForwardOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePortForward} disabled={portForwardBusy}>
              {portForwardBusy ? "Starting..." : "Start port-forward"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debug Pod Dialog */}
      {pod && (
        <DebugPodDialog
          open={debugDialogOpen}
          onOpenChange={setDebugDialogOpen}
          podName={pod.name}
          namespace={pod.namespace}
          containers={pod.containers.map((c) => c.name)}
          kubernetesVersion={clusterInfo?.git_version}
          onDebugStart={handleDebugStart}
        />
      )}

      {/* Terminal Panel */}
      {showTerminal && selectedContainer && pod && (
        <Card className="my-4 overflow-hidden border-2 border-muted">
          <CardContent className="p-0 h-[500px] overflow-hidden relative bg-black">
            <Terminal
              podName={pod.name}
              namespace={pod.namespace}
              containerName={selectedContainer}
              onClose={() => setShowTerminal(false)}
            />
          </CardContent>
        </Card>
      )}
    </ResourceDetailLayout>
  );
}
