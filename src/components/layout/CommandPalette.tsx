import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useClusterStore } from "@/stores/clusterStore";
import * as commands from "@/generated/commands";
import type { ResourceListItem, ResourceQuery } from "@/generated/types";
import {
  Box,
  Network,
  Server,
  FileText,
  Settings,
  Activity,
  Package,
  LayoutDashboard,
  Loader2,
  Search,
} from "lucide-react";

const quickActions = [
  {
    icon: LayoutDashboard,
    label: "Go to Overview",
    path: "/",
    category: "Navigation",
  },
  {
    icon: Box,
    label: "Go to Pods",
    path: "/workloads/pods",
    category: "Navigation",
  },
  {
    icon: Box,
    label: "Go to Deployments",
    path: "/workloads/deployments",
    category: "Navigation",
  },
  {
    icon: Network,
    label: "Go to Services",
    path: "/network/services",
    category: "Navigation",
  },
  {
    icon: Server,
    label: "Go to Nodes",
    path: "/nodes",
    category: "Navigation",
  },
  {
    icon: FileText,
    label: "Go to ConfigMaps",
    path: "/configuration/configmaps",
    category: "Navigation",
  },
  {
    icon: FileText,
    label: "Go to Secrets",
    path: "/configuration/secrets",
    category: "Navigation",
  },
  {
    icon: Activity,
    label: "Go to Events",
    path: "/events",
    category: "Navigation",
  },
  { icon: Package, label: "Go to Helm", path: "/helm", category: "Navigation" },
  {
    icon: Settings,
    label: "Go to Settings",
    path: "/settings",
    category: "Navigation",
  },
];

const quickCommands = [
  { icon: Box, label: "Create Pod" },
  { icon: Box, label: "Create Deployment" },
  { icon: Network, label: "Create Service" },
];

interface ResourceResult {
  kind: string;
  name: string;
  namespace?: string;
  path: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [resourceResults, setResourceResults] = useState<ResourceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { isConnected, currentNamespace } = useClusterStore();
  const searchValue = searchQuery.trim().toLowerCase();
  const hasQuery = searchValue.length > 0;
  const canSearchResources = searchValue.length >= 2;

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleOpen = () => {
      setOpen(true);
    };
    window.addEventListener("command-palette-open", handleOpen);
    return () => window.removeEventListener("command-palette-open", handleOpen);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleSelect = useCallback(
    (path: string) => {
      setOpen(false);
      requestAnimationFrame(() => {
        navigate(path);
      });
    },
    [navigate]
  );

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setResourceResults([]);
      setIsSearching(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !isConnected) {
      setResourceResults([]);
      setIsSearching(false);
      return;
    }

    if (searchValue.length < 2) {
      setResourceResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const namespace = currentNamespace || null;
        const kinds = [
          {
            kind: "pods",
            label: "Pod",
            namespaced: true,
            path: (name: string, ns?: string) => `/pod/${ns}/${name}`,
          },
          {
            kind: "deployments",
            label: "Deployment",
            namespaced: true,
            path: (name: string, ns?: string) => `/deployment/${ns}/${name}`,
          },
          {
            kind: "services",
            label: "Service",
            namespaced: true,
            path: (name: string, ns?: string) => `/service/${ns}/${name}`,
          },
          {
            kind: "nodes",
            label: "Node",
            namespaced: false,
            path: (name: string) => `/nodes/${name}`,
          },
        ];

        const results = await Promise.all(
          kinds.map(async (resource) => {
            try {
              const queryParams: ResourceQuery = {
                kind: resource.kind,
                limit: 200,
                namespace: resource.namespaced ? namespace || null : null,
                name: null,
                labelSelector: null,
                fieldSelector: null,
              };

              console.log(
                `[CommandPalette] Searching ${resource.kind} with query:`,
                queryParams
              );

              // Use generated command with proper typing
              const items = await commands.listResources(queryParams);

              console.log(
                `[CommandPalette] Received ${items?.length || 0} items for ${resource.kind}`,
                items?.slice(0, 2)
              );

              if (!items || !Array.isArray(items)) {
                console.warn(
                  `[CommandPalette] Invalid response for ${resource.kind}:`,
                  items
                );
                return [] as ResourceResult[];
              }

              const filtered = items
                .map((item: ResourceListItem) => {
                  const name = item.metadata.name;
                  const ns = item.metadata.namespace ?? undefined;
                  if (!name) {
                    return null;
                  }
                  const matches =
                    name.toLowerCase().includes(searchValue) ||
                    (ns && ns.toLowerCase().includes(searchValue));
                  if (!matches) {
                    return null;
                  }
                  const path = resource.path(name, ns);
                  if (!path) {
                    return null;
                  }
                  return {
                    kind: resource.label,
                    name,
                    namespace: ns,
                    path,
                  };
                })
                .filter(Boolean) as ResourceResult[];

              console.log(
                `[CommandPalette] Filtered to ${filtered.length} results for ${resource.kind}`
              );
              return filtered;
            } catch (error) {
              console.error(
                `[CommandPalette] Failed to search ${resource.kind}:`,
                error
              );
              return [] as ResourceResult[];
            }
          })
        );

        if (!cancelled) {
          setResourceResults(results.flat());
          setIsSearching(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Search failed:", error);
          setResourceResults([]);
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [currentNamespace, isConnected, open, searchValue]);

  const groupedResources = useMemo(() => {
    return resourceResults.reduce<Record<string, ResourceResult[]>>(
      (acc, item) => {
        acc[item.kind] = acc[item.kind] || [];
        acc[item.kind].push(item);
        return acc;
      },
      {}
    );
  }, [resourceResults]);

  const filteredNavigation = useMemo(() => {
    const items = quickActions.filter(
      (action) => action.category === "Navigation"
    );
    if (!hasQuery) {
      return items;
    }
    return items.filter((action) =>
      action.label.toLowerCase().includes(searchValue)
    );
  }, [hasQuery, searchValue]);

  const filteredQuickCommands = useMemo(() => {
    if (!hasQuery) {
      return quickCommands;
    }
    return quickCommands.filter((action) =>
      action.label.toLowerCase().includes(searchValue)
    );
  }, [hasQuery, searchValue]);

  const hasResourceResults = canSearchResources && resourceResults.length > 0;
  const hasAnyResults =
    filteredNavigation.length > 0 ||
    filteredQuickCommands.length > 0 ||
    hasResourceResults;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="z-[60] max-w-lg overflow-hidden p-0 shadow-lg">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              autoFocus
              placeholder="Search resources, actions, or navigate..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="h-11 pl-9"
            />
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-2">
          {hasQuery && !hasAnyResults && !isSearching && (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              No results found.
            </div>
          )}

          {filteredNavigation.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Navigation
              </div>
              {filteredNavigation.map((action) => (
                <button
                  key={action.path}
                  type="button"
                  onClick={() => handleSelect(action.path)}
                  className="flex w-full items-center rounded-sm px-2 py-2 text-sm hover:bg-accent"
                >
                  <action.icon className="mr-2 h-4 w-4" />
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {filteredNavigation.length > 0 &&
            filteredQuickCommands.length > 0 && (
              <div className="my-2 h-px bg-border" />
            )}

          {filteredQuickCommands.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Quick Actions
              </div>
              {filteredQuickCommands.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center rounded-sm px-2 py-2 text-sm hover:bg-accent"
                >
                  <action.icon className="mr-2 h-4 w-4" />
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {(filteredNavigation.length > 0 ||
            filteredQuickCommands.length > 0) && (
            <div className="my-2 h-px bg-border" />
          )}

          <div className="space-y-1">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Resources
            </div>

            {!isConnected && canSearchResources && (
              <div className="px-2 py-2 text-sm text-muted-foreground">
                Connect to a cluster to search resources.
              </div>
            )}

            {isConnected && !canSearchResources && hasQuery && (
              <div className="px-2 py-2 text-sm text-muted-foreground">
                Type at least 2 characters to search resources.
              </div>
            )}

            {isConnected && isSearching && (
              <div className="flex items-center px-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching...
              </div>
            )}

            {isConnected &&
              canSearchResources &&
              !isSearching &&
              resourceResults.length === 0 && (
                <div className="px-2 py-2 text-sm text-muted-foreground">
                  No resources found.
                </div>
              )}

            {isConnected &&
              !isSearching &&
              Object.entries(groupedResources).map(([kind, items]) => (
                <div key={kind} className="space-y-1">
                  {items.map((item) => (
                    <button
                      key={`${kind}-${item.namespace ?? "cluster"}-${item.name}`}
                      type="button"
                      onClick={() => handleSelect(item.path)}
                      className="flex w-full items-center rounded-sm px-2 py-2 text-sm hover:bg-accent"
                    >
                      <span className="font-medium">{item.name}</span>
                      {item.namespace && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {item.namespace}
                        </span>
                      )}
                      <Badge variant="outline" className="ml-auto">
                        {kind}
                      </Badge>
                    </button>
                  ))}
                </div>
              ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
