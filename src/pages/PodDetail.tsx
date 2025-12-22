import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback, useMemo } from "react";
import { useResourceYaml, useCopyToClipboard, usePodMetrics } from "@/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { LogViewer } from "@/components/logs/LogViewer";
import { Terminal } from "@/components/terminal/Terminal";
import { YamlTabContent } from "@/components/resources/YamlTabContent";
import { ResourceDetailHeader } from "@/components/resources/ResourceDetailHeader";
import { LabelsDisplay } from "@/components/resources/LabelsDisplay";
import { useToast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch";
import { useClusterStore } from "@/stores/clusterStore";
import { getStatusBadgeVariant } from "@/lib/utils";
import { usePortForwardStore } from "@/stores/portForwardStore";
import {
  ArrowLeft,
  Terminal as TerminalIcon,
  Trash2,
  RefreshCw,
  Activity,
  AlertCircle,
  Search,
  Cpu,
  MemoryStick,
} from "lucide-react";
import type { PodInfo } from "@/types/kubernetes";
import { ResourceUsage } from "@/components/ui/resource-usage";

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
  saveConfig: boolean;
}

export function PodDetail() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const copyToClipboard = useCopyToClipboard();
  const currentContext = useClusterStore((state) => state.currentContext);
  const queryClient = useQueryClient();
  const addPortForwardConfig = usePortForwardStore((state) => state.addConfig);
  const startPortForwardConfig = usePortForwardStore(
    (state) => state.startConfig,
  );
  const refreshPortForwards = usePortForwardStore(
    (state) => state.refreshSessions,
  );
  const portForwardSessions = usePortForwardStore((state) => state.sessions);
  const stopPortForwardSession = usePortForwardStore(
    (state) => state.stopSession,
  );
  const portForwardStatusBySession = usePortForwardStore(
    (state) => state.statusBySession,
  );
  const [activeTab, setActiveTab] = useState("overview");
  const [showTerminal, setShowTerminal] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<string | null>(
    null,
  );
  const [isSearchingReplacement, setIsSearchingReplacement] = useState(false);
  const [savedLabels, setSavedLabels] = useState<Record<string, string> | null>(
    null,
  );
  const [portForwardOpen, setPortForwardOpen] = useState(false);
  const [portForwardBusy, setPortForwardBusy] = useState(false);
  const [portForwardForm, setPortForwardForm] = useState<PortForwardFormState>({
    name: "",
    localPort: "",
    remotePort: "",
    autoReconnect: true,
    saveConfig: true,
  });

  const {
    data: pod,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["pod", namespace, name],
    queryFn: async () => {
      const result = await invoke<PodInfo>("get_pod", { name, namespace });
      // Save labels for replacement search
      if (result.labels && Object.keys(result.labels).length > 0) {
        setSavedLabels(result.labels);
      }
      return result;
    },
    enabled: !!namespace && !!name,
    retry: (failureCount, error) => {
      // Don't retry if pod not found (404)
      const errorStr = String(error);
      if (errorStr.includes("not found") || errorStr.includes("NotFound")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Get pod metrics for real-time updates
  const { data: podMetrics } = usePodMetrics(namespace || undefined);
  const podWithMetrics = useMemo(() => {
    if (!pod) return null;
    const metrics = podMetrics?.find(
      (m) => m.name === pod.name && m.namespace === pod.namespace
    );
    return {
      ...pod,
      cpu_usage: metrics?.cpu_usage ?? pod.cpu_usage ?? null,
      memory_usage: metrics?.memory_usage ?? pod.memory_usage ?? null,
    };
  }, [pod, podMetrics]);

  // Find replacement pod by labels
  const findReplacementPod = useCallback(
    async (labelsToUse?: Record<string, string>) => {
      const labels = labelsToUse || savedLabels;
      console.log(
        "findReplacementPod called with labels:",
        labels,
        "namespace:",
        namespace,
      );

      if (!labels || !namespace) {
        console.log("No labels or namespace, returning null");
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
          console.log("No matching labels found, returning null");
          setIsSearchingReplacement(false);
          return null;
        }

        const labelSelector = labelParts.join(",");
        console.log("Label selector:", labelSelector);

        interface PodListItem {
          name: string;
          namespace: string;
          status: {
            phase: string;
          };
        }

        const pods = await invoke<PodListItem[]>("list_pods", {
          filters: {
            namespace,
            label_selector: labelSelector,
          },
        });

        console.log("Found pods:", pods);

        // Find a running pod that's not the current one
        // status.phase is the phase string (Running, Pending, etc.)
        const replacement = pods.find(
          (p) => p.name !== name && p.status.phase === "Running",
        );

        console.log("Replacement pod:", replacement);

        return replacement || null;
      } catch (err) {
        console.error("Failed to find replacement pod:", err);
        return null;
      } finally {
        setIsSearchingReplacement(false);
      }
    },
    [savedLabels, namespace, name],
  );

  const { data: podYaml } = useResourceYaml("Pod", name, namespace, activeTab);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await invoke("delete_pod", { name, namespace });
    },
    onSuccess: () => {
      toast({
        title: "Pod deleted",
        description: `Pod ${name} has been deleted.`,
      });
      navigate(-1);
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: `Failed to delete pod: ${err}`,
        variant: "destructive",
      });
    },
  });

  const restartMutation = useMutation({
    mutationFn: async () => {
      await invoke("restart_pod", { name, namespace });
    },
    onSuccess: () => {
      toast({
        title: "Pod restarted",
        description: `Pod ${name} is being restarted.`,
      });
      queryClient.invalidateQueries({ queryKey: ["pod", namespace, name] });
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: `Failed to restart pod: ${err}`,
        variant: "destructive",
      });
    },
  });

  const copyYaml = () => {
    if (podYaml) {
      copyToClipboard(podYaml, "YAML copied to clipboard.");
    }
  };

  const openTerminal = (containerName: string) => {
    setSelectedContainer(containerName);
    setShowTerminal(true);
  };

  const openPortForwardDialog = () => {
    if (!pod) {
      return;
    }
    setPortForwardForm({
      name: pod.name,
      localPort: "",
      remotePort: "",
      autoReconnect: true,
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
        const config = addPortForwardConfig({
          context: currentContext,
          name: portForwardForm.name.trim() || `${pod.name}:${remotePort}`,
          pod: pod.name,
          namespace: pod.namespace,
          localPort,
          remotePort,
          autoReconnect: portForwardForm.autoReconnect,
        });
        await startPortForwardConfig(config.id);
      } else {
        await invoke("port_forward_pod", {
          pod: pod.name,
          namespace: pod.namespace,
          config: {
            local_port: localPort,
            remote_port: remotePort,
            auto_reconnect: portForwardForm.autoReconnect,
          },
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !pod) {
    const errorStr = String(error || "");
    const isPodNotFound =
      errorStr.includes("not found") || errorStr.includes("NotFound");

    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive text-lg font-medium">
          {isPodNotFound ? "Pod not found" : "Failed to load pod details"}
        </p>
        {isPodNotFound && (
          <p className="text-muted-foreground text-sm">
            The pod may have been deleted or restarted with a new name
          </p>
        )}
        {isSearchingReplacement && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Looking for replacement...</span>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
          {isPodNotFound && savedLabels && (
            <Button
              onClick={() =>
                findReplacementPod().then((replacement) => {
                  if (replacement) {
                    toast({
                      title: "Found replacement pod",
                      description: `Switching to ${replacement.name}`,
                    });
                    navigate(
                      `/pod/${replacement.namespace}/${replacement.name}`,
                      { replace: true },
                    );
                  } else {
                    toast({
                      title: "No replacement found",
                      description: "No other running pods with matching labels",
                      variant: "destructive",
                    });
                  }
                })
              }
              disabled={isSearchingReplacement}
            >
              <Search className="mr-2 h-4 w-4" />
              {isSearchingReplacement ? "Searching..." : "Find Replacement"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const activePortForwards = portForwardSessions.filter(
    (session) =>
      session.context === currentContext &&
      session.pod === pod.name &&
      session.namespace === pod.namespace,
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <ResourceDetailHeader
        title={pod.name}
        namespace={pod.namespace}
        badges={
          <Badge variant={getStatusBadgeVariant(pod.status.phase)}>
            {pod.status.phase}
          </Badge>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={openPortForwardDialog}
              disabled={!currentContext}
            >
              Port Forward
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

      <Dialog open={portForwardOpen} onOpenChange={setPortForwardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Port forward</DialogTitle>
            <DialogDescription>
              Forward traffic from your machine to this pod.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Target</span>
                <span className="font-medium">
                  {pod.namespace}/{pod.name}
                </span>
              </div>
            </div>
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

      {/* Terminal Panel */}
      {showTerminal && selectedContainer && (
        <Card className="overflow-hidden">
          <CardContent className="p-0 h-80 overflow-hidden">
            <Terminal
              podName={pod.name}
              namespace={pod.namespace}
              containerName={selectedContainer}
              onClose={() => setShowTerminal(false)}
            />
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="containers">Containers</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
          <TabsTrigger value="conditions">Conditions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Pod Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phase</span>
                  <span>{pod.status.phase}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Node</span>
                  <span>{pod.node_name || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pod IP</span>
                  <span>{pod.pod_ip || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Host IP</span>
                  <span>{pod.host_ip || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Started</span>
                  <span>
                    {pod.created_at
                      ? new Date(pod.created_at).toLocaleString()
                      : "-"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <LabelsDisplay labels={pod.labels} className="col-span-full" />
          </div>

          {/* Resource Usage Metrics */}
          {podWithMetrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <ResourceUsage
                    used={podWithMetrics.cpu_usage ?? null}
                    total={podWithMetrics.cpu_limits ?? podWithMetrics.cpu_requests ?? null}
                    type="cpu"
                    showProgressBar={true}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
                  <MemoryStick className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <ResourceUsage
                    used={podWithMetrics.memory_usage ?? null}
                    total={podWithMetrics.memory_limits ?? podWithMetrics.memory_requests ?? null}
                    type="memory"
                    showProgressBar={true}
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="containers">
          <div className="space-y-4">
            {pod.containers.map((container) => (
              <Card key={container.name}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    {container.name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={container.ready ? "success" : "destructive"}
                    >
                      {container.ready ? "Ready" : "Not Ready"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openTerminal(container.name)}
                    >
                      <TerminalIcon className="mr-2 h-4 w-4" />
                      Shell
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Image</span>
                    <span className="font-mono text-xs max-w-md truncate">
                      {container.image}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">State</span>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          container.state.type === "running"
                            ? "success"
                            : container.state.type === "waiting"
                              ? "warning"
                              : "secondary"
                        }
                      >
                        {container.state.type}
                      </Badge>
                      {container.state.reason && (
                        <span className="text-xs text-muted-foreground">
                          ({container.state.reason})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Restarts</span>
                    <span
                      className={
                        container.restart_count > 5 ? "text-yellow-500" : ""
                      }
                    >
                      {container.restart_count}
                    </span>
                  </div>
                  {container.started_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Started At</span>
                      <span>
                        {new Date(container.started_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="h-[500px]">
            <CardContent className="p-0 h-full">
              <LogViewer
                key={`${pod.namespace}:${pod.name}`}
                podName={pod.name}
                namespace={pod.namespace}
                containers={pod.containers.map((c) => c.name)}
                initialContainer={pod.containers[0]?.name}
                onPodNotFound={() => {
                  // Refetch to check if pod still exists
                  refetch();
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="yaml">
          <YamlTabContent
            title="Pod YAML"
            yaml={podYaml}
            resourceKind="Pod"
            resourceName={name || ""}
            namespace={namespace}
            fetchYaml={() =>
              invoke<string>("get_pod_yaml", { name, namespace })
            }
            onCopy={copyYaml}
          />
        </TabsContent>

        <TabsContent value="conditions">
          <Card>
            <CardHeader>
              <CardTitle>Pod Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pod.status.conditions.map((condition, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          condition.status === "True" ? "success" : "secondary"
                        }
                      >
                        {condition.type_}
                      </Badge>
                      <span className="text-sm">{condition.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {condition.reason && <span>{condition.reason}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
