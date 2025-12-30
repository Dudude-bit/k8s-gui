import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Node } from "reactflow";
import {
  ResourceNodeData,
  ServiceResourceData,
} from "@/features/infrastructure/types";
import { formatPorts, parsePorts } from "@/features/infrastructure/utils";
import { Button } from "@/components/ui/button";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useInfrastructureBuilderStore } from "@/stores/infrastructureBuilderStore";
import { useClusterStore } from "@/stores/clusterStore";
import { DEFAULT_REGISTRIES, useRegistryStore } from "@/stores/registryStore";
import { useQuery } from "@tanstack/react-query";
import { Trash2, Plus, HelpCircle } from "lucide-react";
import * as commands from "@/generated/commands";
import type {
  RegistryImageResult,
  RegistrySearchRequest,
} from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";

const SERVICE_TYPE_OPTIONS = ["ClusterIP", "NodePort", "LoadBalancer"] as const;
const SERVICE_SESSION_AFFINITY_OPTIONS = ["None", "ClientIP"] as const;
const INGRESS_PATH_TYPE_OPTIONS = [
  "Prefix",
  "Exact",
  "ImplementationSpecific",
] as const;
const SECRET_TYPE_OPTIONS = [
  "Opaque",
  "kubernetes.io/basic-auth",
  "kubernetes.io/dockerconfigjson",
  "kubernetes.io/tls",
  "kubernetes.io/ssh-auth",
  "kubernetes.io/service-account-token",
] as const;
const SEARCH_MIN_LENGTH = 2;

interface KeyValueRow {
  key: string;
  value: string;
}

interface InspectorPanelProps {
  node: Node<ResourceNodeData> | null;
  onUpdate: (nodeId: string, updates: Partial<ResourceNodeData>) => void;
  onRemove: (nodeId: string) => void;
  onOpenYaml: () => void;
}
const ImageSearchInput = ({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
}) => {
  const [results, setResults] = useState<RegistryImageResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [focused, setFocused] = useState(false);
  const registries = useRegistryStore((state) => state.registries);
  const selectedRegistryId = useRegistryStore(
    (state) => state.selectedRegistryId
  );
  const setSelectedRegistryId = useRegistryStore(
    (state) => state.setSelectedRegistryId
  );
  const blurTimeoutRef = useRef<number | null>(null);

  const availableRegistries = registries.length
    ? registries
    : DEFAULT_REGISTRIES;
  const selectedRegistry = useMemo(() => {
    return (
      availableRegistries.find(
        (registry) => registry.id === selectedRegistryId
      ) ?? availableRegistries[0]
    );
  }, [availableRegistries, selectedRegistryId]);

  useEffect(() => {
    if (
      !availableRegistries.some(
        (registry) => registry.id === selectedRegistryId
      )
    ) {
      setSelectedRegistryId(
        availableRegistries[0]?.id ?? DEFAULT_REGISTRIES[0].id
      );
    }
  }, [availableRegistries, selectedRegistryId, setSelectedRegistryId]);

  useEffect(() => {
    const query = value.trim();
    if (query.length < SEARCH_MIN_LENGTH) {
      setResults([]);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const request: RegistrySearchRequest = {
          query,
          registry: {
            ...selectedRegistry,
            baseUrl: selectedRegistry.baseUrl || null,
            host: selectedRegistry.host || null,
            project: selectedRegistry.project || null,
            accountId: selectedRegistry.accountId || null,
            region: selectedRegistry.region || null,
          },
          auth: null,
          useSavedAuth: true,
        };
        const response = await commands.searchRegistryImages(request);
        if (cancelled) {
          return;
        }
        setResults(response);
        setStatus("idle");
      } catch (error) {
        if (cancelled) {
          return;
        }
        setResults([]);
        setStatus("error");
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [value, selectedRegistry]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const handleFocus = () => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
    }
    setFocused(true);
  };

  const handleBlur = () => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
    }
    blurTimeoutRef.current = window.setTimeout(() => setFocused(false), 150);
  };

  const showResults =
    focused &&
    value.trim().length >= SEARCH_MIN_LENGTH &&
    (status !== "idle" || results.length > 0);

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Registry</Label>
          <Link to="/settings" className="text-xs text-primary hover:underline">
            Manage
          </Link>
        </div>
        <Select
          value={selectedRegistryId}
          onValueChange={setSelectedRegistryId}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select registry" />
          </SelectTrigger>
          <SelectContent>
            {availableRegistries.map((registry) => (
              <SelectItem key={registry.id} value={registry.id}>
                {registry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {showResults && (
        <div className="rounded-md border border-border bg-popover p-2 text-sm shadow-sm">
          {status === "loading" && (
            <div className="px-2 py-1 text-xs text-muted-foreground">
              Searching {selectedRegistry.label}...
            </div>
          )}
          {status === "error" && (
            <div className="px-2 py-1 text-xs text-destructive">
              Search failed. Check registry settings.
            </div>
          )}
          {status === "idle" && results.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground">
              No matches found.
            </div>
          )}
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              className="flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(result.name);
                setFocused(false);
              }}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <span>{result.name}</span>
                {result.isOfficial && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">
                    Official
                  </span>
                )}
              </div>
              {result.description && (
                <span className="text-xs text-muted-foreground">
                  {result.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export function InspectorPanel({
  node,
  onUpdate,
  onRemove,
  onOpenYaml,
}: InspectorPanelProps) {
  const allNodes = useInfrastructureBuilderStore((state) => state.nodes);
  const { isConnected, currentContext, currentNamespace } = useClusterStore();
  const [labelRows, setLabelRows] = useState<KeyValueRow[]>([]);
  const [selectorRows, setSelectorRows] = useState<KeyValueRow[]>([]);
  const [configMapRows, setConfigMapRows] = useState<KeyValueRow[]>([]);
  const [secretRows, setSecretRows] = useState<KeyValueRow[]>([]);
  const [portsText, setPortsText] = useState("");

  const { data: namespaces = [] } = useQuery({
    queryKey: ["namespaces", currentContext],
    queryFn: async () => {
      try {
        const result = await commands.listNamespaces();
        return result.map((ns) => ns.name);
      } catch (err) {
        throw normalizeTauriError(err);
      }
    },
    enabled: isConnected,
  });

  const namespaceOptions = useMemo(() => {
    const unique = Array.from(new Set(namespaces));
    unique.sort();
    return unique;
  }, [namespaces]);

  const rowsToRecord = (rows: KeyValueRow[]) =>
    rows.reduce<Record<string, string>>((acc, row) => {
      const key = row.key.trim();
      if (!key) {
        return acc;
      }
      acc[key] = row.value.trim();
      return acc;
    }, {});

  const recordToRows = (record: Record<string, string>): KeyValueRow[] =>
    Object.entries(record).map(([key, value]) => ({ key, value }));

  const nameConflict = useMemo(() => {
    if (!node) {
      return false;
    }
    const name = node.data.name.trim();
    if (!name) {
      return false;
    }
    const namespace = node.data.namespace.trim() || "default";
    return allNodes.some(
      (candidate) =>
        candidate.id !== node.id &&
        candidate.data.kind === node.data.kind &&
        (candidate.data.namespace.trim() || "default") === namespace &&
        candidate.data.name.trim() === name
    );
  }, [allNodes, node]);

  useEffect(() => {
    if (!node) {
      return;
    }
    setLabelRows(recordToRows(node.data.labels));
    setSelectorRows(
      node.data.kind === "Service" ? recordToRows(node.data.selectors) : []
    );
    setConfigMapRows(
      node.data.kind === "ConfigMap" ? recordToRows(node.data.data) : []
    );
    setSecretRows(
      node.data.kind === "Secret" ? recordToRows(node.data.data) : []
    );
    if (
      node.data.kind === "Service" ||
      node.data.kind === "Pod" ||
      node.data.kind === "Deployment"
    ) {
      setPortsText(formatPorts(node.data.ports));
    } else {
      setPortsText("");
    }
  }, [node?.id]);

  if (!node) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Select a resource to edit its configuration.
      </div>
    );
  }

  const isPresetSecretType = SECRET_TYPE_OPTIONS.includes(
    node.data.kind === "Secret"
      ? (node.data.secretType as (typeof SECRET_TYPE_OPTIONS)[number])
      : "Opaque"
  );
  const secretTypeValue =
    node.data.kind === "Secret" && isPresetSecretType
      ? node.data.secretType
      : "custom";
  const namespaceValue = node.data.namespace.trim();
  const isNamespacePreset = namespaceOptions.includes(namespaceValue);
  const namespaceSelectValue = namespaceValue
    ? isNamespacePreset
      ? namespaceValue
      : "__custom__"
    : "__inherit__";
  const showNamespaceInput =
    !isConnected ||
    namespaceOptions.length === 0 ||
    namespaceSelectValue === "__custom__";

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <div className="text-sm font-semibold">{node.data.kind} Settings</div>
        <p className="text-xs text-muted-foreground">
          Adjust core fields here, or switch to YAML for advanced options.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="resource-name">Name</Label>
          <Input
            id="resource-name"
            value={node.data.name}
            className={
              nameConflict
                ? "border-destructive focus-visible:ring-destructive"
                : undefined
            }
            onChange={(event) =>
              onUpdate(node.id, { name: event.target.value })
            }
          />
          {nameConflict && (
            <p className="text-xs text-destructive">
              Name already used for a {node.data.kind} in this namespace.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="resource-namespace">Namespace</Label>
          {isConnected && namespaceOptions.length > 0 ? (
            <>
              <Select
                value={namespaceSelectValue}
                onValueChange={(value) => {
                  if (value === "__inherit__") {
                    onUpdate(node.id, { namespace: "" });
                    return;
                  }
                  if (value === "__custom__") {
                    return;
                  }
                  onUpdate(node.id, { namespace: value });
                }}
              >
                <SelectTrigger id="resource-namespace">
                  <SelectValue
                    placeholder={
                      currentNamespace
                        ? `Use current (${currentNamespace})`
                        : "Use current context"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__inherit__">
                    Use current context
                    {currentNamespace ? ` (${currentNamespace})` : ""}
                  </SelectItem>
                  {namespaceOptions.map((ns) => (
                    <SelectItem key={ns} value={ns}>
                      {ns}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">Custom...</SelectItem>
                </SelectContent>
              </Select>
              {showNamespaceInput && (
                <Input
                  id="resource-namespace-custom"
                  placeholder="custom namespace"
                  value={node.data.namespace}
                  onChange={(event) =>
                    onUpdate(node.id, { namespace: event.target.value })
                  }
                />
              )}
            </>
          ) : (
            <Input
              id="resource-namespace"
              placeholder="default"
              value={node.data.namespace}
              onChange={(event) =>
                onUpdate(node.id, { namespace: event.target.value })
              }
            />
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="resource-labels">Labels</Label>
          <div className="space-y-2">
            {labelRows.map((row, index) => (
              <div
                key={`${row.key}-${index}`}
                className="flex items-center gap-2"
              >
                <Input
                  placeholder="key"
                  value={row.key}
                  onChange={(event) => {
                    const next = labelRows.map((item, idx) =>
                      idx === index
                        ? { ...item, key: event.target.value }
                        : item
                    );
                    setLabelRows(next);
                    onUpdate(node.id, { labels: rowsToRecord(next) });
                  }}
                />
                <Input
                  placeholder="value"
                  value={row.value}
                  onChange={(event) => {
                    const next = labelRows.map((item, idx) =>
                      idx === index
                        ? { ...item, value: event.target.value }
                        : item
                    );
                    setLabelRows(next);
                    onUpdate(node.id, { labels: rowsToRecord(next) });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const next = labelRows.filter((_, idx) => idx !== index);
                    setLabelRows(next);
                    onUpdate(node.id, { labels: rowsToRecord(next) });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLabelRows((prev) => [...prev, { key: "", value: "" }])
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Add label
            </Button>
          </div>
        </div>
      </div>

      {node.data.kind === "Pod" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pod-image">Container Image</Label>
            <ImageSearchInput
              id="pod-image"
              value={node.data.image}
              onChange={(value) => onUpdate(node.id, { image: value })}
              placeholder="nginx:latest"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pod-ports">Ports</Label>
            <Input
              id="pod-ports"
              placeholder="80, 443"
              value={portsText}
              onChange={(event) => {
                const value = event.target.value;
                setPortsText(value);
                onUpdate(node.id, { ports: parsePorts(value) });
              }}
            />
          </div>
        </div>
      )}

      {node.data.kind === "Deployment" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="deployment-replicas">Replicas</Label>
            <Input
              id="deployment-replicas"
              type="number"
              min={0}
              value={node.data.replicas}
              onChange={(event) =>
                onUpdate(node.id, {
                  replicas: Number.parseInt(event.target.value, 10) || 0,
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deployment-image">Container Image</Label>
            <ImageSearchInput
              id="deployment-image"
              value={node.data.image}
              onChange={(value) => onUpdate(node.id, { image: value })}
              placeholder="nginx:latest"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deployment-ports">Ports</Label>
            <Input
              id="deployment-ports"
              placeholder="80, 443"
              value={portsText}
              onChange={(event) => {
                const value = event.target.value;
                setPortsText(value);
                onUpdate(node.id, { ports: parsePorts(value) });
              }}
            />
          </div>
        </div>
      )}

      {node.data.kind === "Service" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Service Type</Label>
            <Select
              value={node.data.serviceType}
              onValueChange={(value) =>
                onUpdate(node.id, {
                  serviceType: value as ServiceResourceData["serviceType"],
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_TYPE_OPTIONS.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label>Session Affinity</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Routes client requests to the same backend when set to
                  ClientIP.
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              value={node.data.sessionAffinity}
              onValueChange={(value) =>
                onUpdate(node.id, {
                  sessionAffinity:
                    value as ServiceResourceData["sessionAffinity"],
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select affinity" />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_SESSION_AFFINITY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="service-ports">Ports</Label>
            <Input
              id="service-ports"
              placeholder="80, 443"
              value={portsText}
              onChange={(event) => {
                const value = event.target.value;
                setPortsText(value);
                onUpdate(node.id, { ports: parsePorts(value) });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="service-selectors">Selectors</Label>
            <div className="space-y-2">
              {selectorRows.map((row, index) => (
                <div
                  key={`${row.key}-${index}`}
                  className="flex items-center gap-2"
                >
                  <Input
                    placeholder="key"
                    value={row.key}
                    onChange={(event) => {
                      const next = selectorRows.map((item, idx) =>
                        idx === index
                          ? { ...item, key: event.target.value }
                          : item
                      );
                      setSelectorRows(next);
                      onUpdate(node.id, { selectors: rowsToRecord(next) });
                    }}
                  />
                  <Input
                    placeholder="value"
                    value={row.value}
                    onChange={(event) => {
                      const next = selectorRows.map((item, idx) =>
                        idx === index
                          ? { ...item, value: event.target.value }
                          : item
                      );
                      setSelectorRows(next);
                      onUpdate(node.id, { selectors: rowsToRecord(next) });
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const next = selectorRows.filter(
                        (_, idx) => idx !== index
                      );
                      setSelectorRows(next);
                      onUpdate(node.id, { selectors: rowsToRecord(next) });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSelectorRows((prev) => [...prev, { key: "", value: "" }])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add selector
              </Button>
            </div>
          </div>
        </div>
      )}

      {node.data.kind === "Ingress" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ingress-host">Host</Label>
            <Input
              id="ingress-host"
              placeholder="example.com"
              value={node.data.host}
              onChange={(event) =>
                onUpdate(node.id, { host: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ingress-path">Path</Label>
            <Input
              id="ingress-path"
              placeholder="/"
              value={node.data.path}
              onChange={(event) =>
                onUpdate(node.id, { path: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label>Path Type</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Controls how the path is matched (Prefix, Exact, or
                  ImplementationSpecific).
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              value={node.data.pathType}
              onValueChange={(value) =>
                onUpdate(node.id, {
                  pathType: value as (typeof INGRESS_PATH_TYPE_OPTIONS)[number],
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select path type" />
              </SelectTrigger>
              <SelectContent>
                {INGRESS_PATH_TYPE_OPTIONS.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ingress-service">Backend Service</Label>
            <Input
              id="ingress-service"
              placeholder="service-name"
              value={node.data.serviceName}
              onChange={(event) =>
                onUpdate(node.id, { serviceName: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ingress-port">Backend Port</Label>
            <Input
              id="ingress-port"
              type="number"
              min={1}
              value={node.data.servicePort}
              onChange={(event) =>
                onUpdate(node.id, {
                  servicePort: Number.parseInt(event.target.value, 10) || 80,
                })
              }
            />
          </div>
        </div>
      )}

      {node.data.kind === "ConfigMap" && (
        <div className="space-y-1.5">
          <Label>Data</Label>
          <div className="space-y-2">
            {configMapRows.map((row, index) => (
              <div
                key={`${row.key}-${index}`}
                className="flex items-center gap-2"
              >
                <Input
                  placeholder="key"
                  value={row.key}
                  onChange={(event) => {
                    const next = configMapRows.map((item, idx) =>
                      idx === index
                        ? { ...item, key: event.target.value }
                        : item
                    );
                    setConfigMapRows(next);
                    onUpdate(node.id, { data: rowsToRecord(next) });
                  }}
                />
                <Input
                  placeholder="value"
                  value={row.value}
                  onChange={(event) => {
                    const next = configMapRows.map((item, idx) =>
                      idx === index
                        ? { ...item, value: event.target.value }
                        : item
                    );
                    setConfigMapRows(next);
                    onUpdate(node.id, { data: rowsToRecord(next) });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const next = configMapRows.filter(
                      (_, idx) => idx !== index
                    );
                    setConfigMapRows(next);
                    onUpdate(node.id, { data: rowsToRecord(next) });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setConfigMapRows((prev) => [...prev, { key: "", value: "" }])
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Add entry
            </Button>
          </div>
        </div>
      )}

      {node.data.kind === "Secret" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="secret-type">Secret Type</Label>
            <Select
              value={secretTypeValue}
              onValueChange={(value) => {
                if (value === "custom") {
                  if (isPresetSecretType) {
                    onUpdate(node.id, { secretType: "" });
                  }
                  return;
                }
                onUpdate(node.id, { secretType: value });
              }}
            >
              <SelectTrigger id="secret-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {SECRET_TYPE_OPTIONS.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {secretTypeValue === "custom" && (
              <Input
                id="secret-type-custom"
                placeholder="custom secret type"
                value={isPresetSecretType ? "" : node.data.secretType}
                onChange={(event) =>
                  onUpdate(node.id, { secretType: event.target.value })
                }
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <div className="space-y-2">
              {secretRows.map((row, index) => (
                <div
                  key={`${row.key}-${index}`}
                  className="flex items-center gap-2"
                >
                  <Input
                    placeholder="key"
                    value={row.key}
                    onChange={(event) => {
                      const next = secretRows.map((item, idx) =>
                        idx === index
                          ? { ...item, key: event.target.value }
                          : item
                      );
                      setSecretRows(next);
                      onUpdate(node.id, { data: rowsToRecord(next) });
                    }}
                  />
                  <Input
                    placeholder="value"
                    value={row.value}
                    onChange={(event) => {
                      const next = secretRows.map((item, idx) =>
                        idx === index
                          ? { ...item, value: event.target.value }
                          : item
                      );
                      setSecretRows(next);
                      onUpdate(node.id, { data: rowsToRecord(next) });
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const next = secretRows.filter((_, idx) => idx !== index);
                      setSecretRows(next);
                      onUpdate(node.id, { data: rowsToRecord(next) });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSecretRows((prev) => [...prev, { key: "", value: "" }])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add entry
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onOpenYaml}>
          Open YAML
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onRemove(node.id)}
        >
          Remove Resource
        </Button>
      </div>
    </div>
  );
}
