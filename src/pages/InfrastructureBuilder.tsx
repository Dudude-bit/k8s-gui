import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowInstance,
  Connection,
  Node,
  Edge,
  SelectionMode,
  type OnSelectionChangeParams,
} from "reactflow";
import "reactflow/dist/style.css";
import CodeMirror from "@uiw/react-codemirror";
import { yaml as yamlLanguage } from "@codemirror/lang-yaml";
import { useToast } from "@/components/ui/use-toast";
import { useClusterStore } from "@/stores/clusterStore";
import { useThemeStore } from "@/stores/themeStore";
import { useInfrastructureBuilderStore } from "@/stores/infrastructureBuilderStore";
import { ResourceNode } from "@/components/infrastructure/ResourceNode";
import { ResourcePalette } from "@/components/infrastructure/ResourcePalette";
import { InspectorPanel } from "@/components/infrastructure/InspectorPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { buildManifestYaml } from "@/features/infrastructure/utils";
import {
  ResourceKind,
  ResourceNodeData,
} from "@/features/infrastructure/types";
import { useImportFromCluster } from "@/features/infrastructure/useImportFromCluster";
import { applyInfrastructureTemplate } from "@/features/infrastructure/templates";
import { usePaletteDragDrop } from "@/features/infrastructure/usePaletteDragDrop";
import { useBuilderKeyboardShortcuts } from "@/features/infrastructure/useBuilderKeyboardShortcuts";
import {
  RefreshCw,
  CheckCircle2,
  Play,
  AlertTriangle,
  Trash2,
  HelpCircle,
} from "lucide-react";
import { commands } from "@/lib/commands";
import { normalizeTauriError } from "@/lib/error-utils";
import { ResourceType } from "@/lib/resource-registry";

const LOCAL_CONTEXT = "__local__";

const isValidConnection = (source: ResourceKind, target: ResourceKind) => {
  if (source === ResourceType.Ingress && target === ResourceType.Service) {
    return true;
  }
  if (
    source === ResourceType.Service &&
    (target === ResourceType.Pod || target === ResourceType.Deployment)
  ) {
    return true;
  }
  return false;
};

export function InfrastructureBuilder() {
  const { toast } = useToast();
  const { isConnected, currentContext, currentNamespace } = useClusterStore();
  const theme = useThemeStore((state) => state.theme);
  const {
    nodes,
    edges,
    yamlText,
    extraManifests,
    selectedNodeId,
    setContext,
    setYamlText,
    setNodes,
    setEdges,
    setSelectedNodeId,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addResource,
    updateNode,
    removeNode,
    clearCanvas,
    syncFromYaml,
    syncToYaml,
  } = useInfrastructureBuilderStore();
  const [mode, setMode] = useState<"visual" | "yaml">("visual");
  const [filter, setFilter] = useState("");
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [includeImported, setIncludeImported] = useState(false);
  const [selection, setSelection] = useState<{
    nodes: Node<ResourceNodeData>[];
    edges: Edge[];
  }>({
    nodes: [],
    edges: [],
  });
  const [lastResult, setLastResult] = useState<{
    title: string;
    message: string;
    success: boolean;
  } | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const addCounterRef = useRef(0);

  const editorTheme = useMemo(() => {
    if (theme === "dark") {
      return "dark";
    }
    if (theme === "light") {
      return "light";
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
    return "light";
  }, [theme]);

  useEffect(() => {
    setContext(currentContext ?? LOCAL_CONTEXT);
  }, [currentContext, setContext]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const nodeTypes = useMemo(() => ({ resource: ResourceNode }), []);

  const visibleNodes = useMemo(() => {
    if (!filter.trim()) {
      return nodes;
    }
    const term = filter.toLowerCase();
    return nodes.map((node) => {
      const haystack =
        `${node.data.kind} ${node.data.name} ${node.data.namespace}`.toLowerCase();
      return { ...node, hidden: !haystack.includes(term) };
    });
  }, [nodes, filter]);

  const toFlowPosition = useCallback(
    (point: { x: number; y: number }) => {
      if (!reactFlowInstance || !reactFlowWrapper.current) {
        return { x: 0, y: 0 };
      }
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const screenToFlowPosition = (
        reactFlowInstance as ReactFlowInstance & {
          screenToFlowPosition?: (pos: { x: number; y: number }) => {
            x: number;
            y: number;
          };
        }
      ).screenToFlowPosition;
      if (screenToFlowPosition) {
        return screenToFlowPosition(point);
      }
      return reactFlowInstance.project({
        x: point.x - bounds.left,
        y: point.y - bounds.top,
      });
    },
    [reactFlowInstance]
  );

  const { handlePalettePointerDown, suppressClickRef } = usePaletteDragDrop({
    reactFlowWrapper,
    toFlowPosition,
    addResource,
    currentNamespace,
  });

  const handleAddResource = useCallback(
    (kind: ResourceKind) => {
      let base = { x: 0, y: 0 };
      if (reactFlowWrapper.current) {
        const bounds = reactFlowWrapper.current.getBoundingClientRect();
        base = toFlowPosition({
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        });
      }
      const offsetIndex = addCounterRef.current % 9;
      const position = {
        x: base.x + ((offsetIndex % 3) - 1) * 220,
        y: base.y + (Math.floor(offsetIndex / 3) - 1) * 160,
      };
      addCounterRef.current += 1;
      addResource(kind, position, currentNamespace || "default");
    },
    [addResource, currentNamespace, toFlowPosition]
  );

  const handlePaletteClick = useCallback(
    (kind: ResourceKind) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      handleAddResource(kind);
    },
    [handleAddResource, suppressClickRef]
  );

  const handleSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      const nextNodes = params.nodes ?? [];
      const nextEdges = params.edges ?? [];
      setSelection({ nodes: nextNodes, edges: nextEdges });
      if (nextNodes.length === 1 && nextEdges.length === 0) {
        setSelectedNodeId(nextNodes[0].id);
      } else {
        setSelectedNodeId(null);
      }
    },
    [setSelectedNodeId]
  );

  const handleDeleteSelection = useCallback(() => {
    if (selection.nodes.length === 0 && selection.edges.length === 0) {
      return;
    }
    const nodeIds = new Set(selection.nodes.map((node) => node.id));
    const edgeIds = new Set(selection.edges.map((edge) => edge.id));
    const nextNodes = nodes.filter((node) => !nodeIds.has(node.id));
    const nextEdges = edges.filter(
      (edge) =>
        !edgeIds.has(edge.id) &&
        !nodeIds.has(edge.source) &&
        !nodeIds.has(edge.target)
    );
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelection({ nodes: [], edges: [] });
    setSelectedNodeId(null);
  }, [edges, nodes, selection, setEdges, setNodes, setSelectedNodeId]);

  const handleClearCanvas = useCallback(() => {
    clearCanvas();
    setSelection({ nodes: [], edges: [] });
    addCounterRef.current = 0;
  }, [clearCanvas]);

  useBuilderKeyboardShortcuts({
    enabled: mode === "visual",
    nodes,
    edges,
    setNodes,
    setEdges,
    setSelection,
    onDeleteSelection: handleDeleteSelection,
  });

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return;
      }
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      if (!sourceNode || !targetNode) {
        return;
      }
      if (!isValidConnection(sourceNode.data.kind, targetNode.data.kind)) {
        toast({
          title: "Invalid connection",
          description:
            "Ingress connects to Services, and Services connect to Pods or Deployments.",
          variant: "destructive",
        });
        return;
      }
      onConnect(connection);
      if (
        sourceNode.data.kind === ResourceType.Ingress &&
        targetNode.data.kind === ResourceType.Service
      ) {
        updateNode(sourceNode.id, {
          serviceName: targetNode.data.name,
          servicePort: targetNode.data.ports[0] ?? 80,
        });
      }
      if (
        sourceNode.data.kind === ResourceType.Service &&
        targetNode.data.kind !== ResourceType.Service
      ) {
        const selectors = sourceNode.data.selectors;
        if (
          Object.keys(selectors).length === 0 &&
          Object.keys(targetNode.data.labels).length > 0
        ) {
          updateNode(sourceNode.id, { selectors: targetNode.data.labels });
        }
      }
    },
    [nodes, onConnect, toast, updateNode]
  );

  const handleModeChange = useCallback(
    (value: string) => {
      if (value === "yaml") {
        syncToYaml();
        setMode("yaml");
        return;
      }
      if (value === "visual") {
        const result = syncFromYaml();
        if (!result.success) {
          toast({
            title: "Invalid YAML",
            description:
              result.message ?? "Fix YAML before switching to the canvas.",
            variant: "destructive",
          });
          return;
        }
        setMode("visual");
      }
    },
    [syncFromYaml, syncToYaml, toast]
  );

  const buildApplyPayload = useCallback(
    (includeImportedResources: boolean) => {
      if (mode !== "visual") {
        return yamlText;
      }
      const scoped = includeImportedResources
        ? nodes
        : nodes.filter((node) => node.data.origin !== "cluster");
      return buildManifestYaml(
        scoped.map((node) => node.data),
        extraManifests
      );
    },
    [extraManifests, mode, nodes, yamlText]
  );

  const handleValidate = useCallback(async () => {
    const content = buildApplyPayload(includeImported);
    if (!content.trim()) {
      toast({
        title: "Nothing to validate",
        description: "Add resources or paste a manifest first.",
        variant: "destructive",
      });
      return;
    }
    if (!isConnected) {
      toast({
        title: "Cluster not connected",
        description: "Connect to a cluster to validate manifests.",
        variant: "destructive",
      });
      return;
    }
    setIsValidating(true);
    try {
      const result = await commands.validateManifest(
        content,
        currentNamespace || null
      );
      const message = result.stderr || result.stdout || "Validation completed.";
      setLastResult({
        title: result.success ? "Validation passed" : "Validation failed",
        message,
        success: result.success,
      });
      toast({
        title: result.success ? "Validation passed" : "Validation failed",
        description: message,
        variant: result.success ? "default" : "destructive",
      });
    } catch (error) {
      const message = normalizeTauriError(error);
      setLastResult({ title: "Validation failed", message, success: false });
      toast({
        title: "Validation failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  }, [
    buildApplyPayload,
    currentNamespace,
    includeImported,
    isConnected,
    toast,
  ]);

  const handleApply = useCallback(async () => {
    const content = buildApplyPayload(includeImported);
    if (!content.trim()) {
      toast({
        title: "Nothing to apply",
        description: "Add resources or paste a manifest first.",
        variant: "destructive",
      });
      return;
    }
    if (!isConnected) {
      toast({
        title: "Cluster not connected",
        description: "Connect to a cluster to apply manifests.",
        variant: "destructive",
      });
      return;
    }
    setIsApplying(true);
    try {
      const result = await commands.applyManifest(
        content,
        currentNamespace || null
      );
      const message = result.stderr || result.stdout || "Apply completed.";
      setLastResult({
        title: result.success ? "Apply succeeded" : "Apply failed",
        message,
        success: result.success,
      });
      toast({
        title: result.success ? "Apply succeeded" : "Apply failed",
        description: message,
        variant: result.success ? "default" : "destructive",
      });
    } catch (error) {
      const message = normalizeTauriError(error);
      setLastResult({ title: "Apply failed", message, success: false });
      toast({
        title: "Apply failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  }, [
    buildApplyPayload,
    currentNamespace,
    includeImported,
    isConnected,
    toast,
  ]);

  const { importFromCluster: handleImportFromCluster, isImporting } =
    useImportFromCluster(() => setMode("visual"));

  const handleTemplate = useCallback(
    (templateId: string) => {
      applyInfrastructureTemplate(templateId, {
        addResource,
        updateNode,
        onConnect,
        reactFlowInstance,
        namespace: currentNamespace || "default",
      });
    },
    [addResource, currentNamespace, onConnect, reactFlowInstance, updateNode]
  );

  const handleOpenYaml = useCallback(() => {
    syncToYaml();
    setMode("yaml");
  }, [syncToYaml]);

  const emptyCanvas = nodes.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Infrastructure Builder</h1>
          <p className="text-sm text-muted-foreground">
            Design manifests visually or edit raw YAML before applying to the
            cluster.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Open builder help"
                onClick={() => setHelpOpen(true)}
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="center" className="max-w-xs">
              <div className="text-xs font-semibold">Quick tips</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Drag from palette, lasso select on empty canvas.
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Delete: Backspace · Select all: Cmd/Ctrl+A · Invert:
                Cmd/Ctrl+Shift+I
              </div>
            </TooltipContent>
          </Tooltip>
          <Button
            variant="outline"
            onClick={handleDeleteSelection}
            disabled={
              selection.nodes.length === 0 && selection.edges.length === 0
            }
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Selection
          </Button>
          <Button variant="outline" onClick={() => setClearOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear Canvas
          </Button>
          <Button
            variant="outline"
            onClick={handleImportFromCluster}
            disabled={isImporting}
          >
            {isImporting ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Import
          </Button>
          <Button
            variant="outline"
            onClick={handleValidate}
            disabled={isValidating}
          >
            {isValidating ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Validate
          </Button>
          <Button onClick={handleApply} disabled={isApplying}>
            {isApplying ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Apply
          </Button>
          {mode === "visual" && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1">
              <Switch
                id="include-imported"
                checked={includeImported}
                onCheckedChange={setIncludeImported}
              />
              <Label
                htmlFor="include-imported"
                className="text-xs text-muted-foreground"
              >
                Include imported
              </Label>
            </div>
          )}
        </div>
      </div>

      {!isConnected && (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          Connect to a cluster to validate, apply, or import live resources.
        </div>
      )}

      <Tabs value={mode} onValueChange={handleModeChange}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="visual">Visual</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Filter resources..."
              className="w-56"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <Badge variant="outline">{nodes.length} resources</Badge>
          </div>
        </div>

        <TabsContent value="visual">
          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
            <ResourcePalette
              onAdd={handlePaletteClick}
              onTemplate={handleTemplate}
              onPointerDown={handlePalettePointerDown}
            />
            <div className="flex min-h-[520px] flex-col gap-3">
              <div
                ref={reactFlowWrapper}
                className="relative h-[520px] flex-1 rounded-lg border border-border bg-background"
              >
                <ReactFlow
                  nodes={visibleNodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={handleConnect}
                  selectionOnDrag
                  selectionMode={SelectionMode.Partial}
                  onSelectionChange={handleSelectionChange}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  onPaneClick={() => setSelectedNodeId(null)}
                  onInit={setReactFlowInstance}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                  className="rounded-lg"
                >
                  <Background gap={16} size={1} color="hsl(var(--border))" />
                  <Controls />
                  <MiniMap
                    nodeColor={(node) => {
                      const kind = (node.data as ResourceNodeData).kind;
                      if (kind === ResourceType.Service) return "#22c55e";
                      if (kind === ResourceType.Deployment) return "#a855f7";
                      if (kind === ResourceType.Pod) return "#3b82f6";
                      if (kind === ResourceType.Ingress) return "#06b6d4";
                      if (kind === ResourceType.ConfigMap) return "#f59e0b";
                      return "#ef4444";
                    }}
                  />
                </ReactFlow>
                {emptyCanvas && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="rounded-lg border border-dashed border-border bg-background/80 p-4 text-center text-sm text-muted-foreground">
                      Drag resources here or use the palette to start building.
                    </div>
                  </div>
                )}
              </div>
              {lastResult && (
                <div
                  className={`rounded-lg border border-border p-3 text-xs ${
                    lastResult.success
                      ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                      : "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200"
                  }`}
                >
                  <div className="font-semibold">{lastResult.title}</div>
                  <pre className="mt-2 whitespace-pre-wrap">
                    {lastResult.message}
                  </pre>
                </div>
              )}
            </div>
            <InspectorPanel
              node={selectedNode}
              onUpdate={updateNode}
              onRemove={removeNode}
              onOpenYaml={handleOpenYaml}
            />
          </div>
        </TabsContent>

        <TabsContent value="yaml">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-background">
                <CodeMirror
                  value={yamlText}
                  height="520px"
                  theme={editorTheme}
                  extensions={[yamlLanguage()]}
                  onChange={(value) => setYamlText(value)}
                />
              </div>
              {lastResult && (
                <div
                  className={`rounded-lg border border-border p-3 text-xs ${
                    lastResult.success
                      ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                      : "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200"
                  }`}
                >
                  <div className="font-semibold">{lastResult.title}</div>
                  <pre className="mt-2 whitespace-pre-wrap">
                    {lastResult.message}
                  </pre>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                Use this editor to paste or fine-tune manifests. Switching back
                to the visual mode will parse and map supported resource types.
              </div>
              {!isConnected && (
                <ConnectClusterEmptyState resourceLabel="Manifests" />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear canvas?"
        description="This will remove all resources and connections from the canvas."
        confirmLabel="Clear"
        confirmVariant="destructive"
        onConfirm={() => {
          setClearOpen(false);
          handleClearCanvas();
        }}
      />
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Infrastructure Builder help</DialogTitle>
            <DialogDescription>
              Shortcuts and selection tips for the canvas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                Canvas
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Drag a resource from the palette to place it.</li>
                <li>
                  Click a resource in the palette to add it near the canvas
                  center.
                </li>
                <li>Drag on empty canvas to draw a selection box.</li>
                <li>Click a node to select it, drag to move.</li>
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                Shortcuts
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Delete or Backspace: remove current selection.</li>
                <li>Cmd/Ctrl + A: select all nodes and edges.</li>
                <li>Cmd/Ctrl + Shift + I: invert selection.</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
