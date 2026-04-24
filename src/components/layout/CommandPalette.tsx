import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useClusterStore } from "@/stores/clusterStore";
import { commands } from "@/lib/commands";
import type { ResourceListItem, ResourceQuery, RecentItem } from "@/generated/types";
import { ResourceType, toPlural, getScope } from "@/lib/resource-registry";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import {
  Box,
  Network,
  Server,
  FileText,
  Settings,
  Activity,
  Package,
  LayoutDashboard,
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
    path: `/workloads/${toPlural(ResourceType.Pod)}`,
    category: "Navigation",
  },
  {
    icon: Box,
    label: "Go to Deployments",
    path: `/workloads/${toPlural(ResourceType.Deployment)}`,
    category: "Navigation",
  },
  {
    icon: Network,
    label: "Go to Services",
    path: `/network/${toPlural(ResourceType.Service)}`,
    category: "Navigation",
  },
  {
    icon: Server,
    label: "Go to Nodes",
    path: `/${toPlural(ResourceType.Node)}`,
    category: "Navigation",
  },
  {
    icon: FileText,
    label: "Go to ConfigMaps",
    path: `/configuration/${toPlural(ResourceType.ConfigMap)}`,
    category: "Navigation",
  },
  {
    icon: FileText,
    label: "Go to Secrets",
    path: `/configuration/${toPlural(ResourceType.Secret)}`,
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
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
    (path: string, name?: string, kind?: string, namespace?: string) => {
      if (name && kind) {
        commands.addRecentItem({
          name,
          kind,
          path,
          namespace: namespace ?? null,
          timestamp: Date.now(),
        }).catch(() => {
          // Ignore errors saving recent item
        });
      }
      setOpen(false);
      requestAnimationFrame(() => {
        navigate(path);
      });
    },
    [navigate]
  );

  useEffect(() => {
    if (open) {
      commands.getRecentItems().then(setRecentItems).catch(() => {
        setRecentItems([]);
      });
    } else {
      setSearchQuery("");
      setResourceResults([]);
      setIsSearching(false);
      setSelectedIndex(0);
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
        const searchableKinds = [
          ResourceType.Pod,
          ResourceType.Deployment,
          ResourceType.Service,
          ResourceType.ConfigMap,
          ResourceType.Secret,
          ResourceType.Ingress,
          ResourceType.Node,
        ];

        const results = await Promise.all(
          searchableKinds.map(async (kind) => {
            try {
              const isNamespaced = getScope(kind) === "namespaced";
              const queryParams: ResourceQuery = {
                kind: toPlural(kind),
                limit: 200,
                namespace: isNamespaced ? namespace || null : null,
                name: null,
                labelSelector: null,
                fieldSelector: null,
              };

              const items = await commands.listResources(queryParams);

              if (!items || !Array.isArray(items)) {
                return [] as ResourceResult[];
              }

              return items
                .map((item: ResourceListItem) => {
                  const name = item.metadata.name;
                  const ns = item.metadata.namespace ?? undefined;
                  if (!name) return null;
                  const matches =
                    name.toLowerCase().includes(searchValue) ||
                    (ns && ns.toLowerCase().includes(searchValue));
                  if (!matches) return null;
                  return {
                    kind,
                    name,
                    namespace: ns,
                    path: getResourceDetailUrl(kind, name, ns),
                  };
                })
                .filter(Boolean) as ResourceResult[];
            } catch {
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

  // Flattened list of all selectable items for keyboard navigation
  const allItems = useMemo(() => {
    const items: Array<{
      type: "recent" | "nav" | "action" | "resource";
      path?: string;
      name?: string;
      kind?: string;
      namespace?: string;
      label?: string;
    }> = [];

    // Recent items (only when no query)
    if (!hasQuery && recentItems.length > 0) {
      recentItems.forEach((item) => {
        items.push({ type: "recent", path: item.path, name: item.name, kind: item.kind, namespace: item.namespace ?? undefined });
      });
    }

    // Navigation items
    filteredNavigation.forEach((action) => {
      items.push({ type: "nav", path: action.path, label: action.label });
    });

    // Quick actions
    filteredQuickCommands.forEach((action) => {
      items.push({ type: "action", label: action.label });
    });

    // Resource results
    resourceResults.forEach((item) => {
      items.push({ type: "resource", path: item.path, name: item.name, kind: item.kind, namespace: item.namespace });
    });

    return items;
  }, [hasQuery, recentItems, filteredNavigation, filteredQuickCommands, resourceResults]);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [allItems.length]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && allItems.length > 0) {
        e.preventDefault();
        const item = allItems[selectedIndex];
        if (item?.path) {
          handleSelect(item.path, item.name, item.kind, item.namespace);
        }
      }
    },
    [allItems, selectedIndex, handleSelect]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selected = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selected) {
        selected.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

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
              onKeyDown={handleKeyDown}
              className="h-11 pl-9"
            />
          </div>
        </div>

        <div ref={resultsRef} className="max-h-[320px] overflow-y-auto p-2">
          {hasQuery && !hasAnyResults && !isSearching && (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              No results found.
            </div>
          )}

          {/* Recent items - show when no query */}
          {!hasQuery && recentItems.length > 0 && (
            <>
              <div className="space-y-1">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Recent
                </div>
                {recentItems.map((item, idx) => (
                  <button
                    key={item.path}
                    type="button"
                    data-index={idx}
                    onClick={() => handleSelect(item.path, item.name, item.kind, item.namespace ?? undefined)}
                    className={`flex w-full items-center rounded-sm px-2 py-2 text-sm hover:bg-accent ${selectedIndex === idx ? "bg-accent" : ""}`}
                  >
                    <span className="font-medium">{item.name}</span>
                    <Badge variant="outline" className="ml-auto">
                      {item.kind}
                    </Badge>
                  </button>
                ))}
              </div>
              <div className="my-2 h-px bg-border" />
            </>
          )}

          {filteredNavigation.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Navigation
              </div>
              {filteredNavigation.map((action, idx) => {
                const globalIdx = (!hasQuery ? recentItems.length : 0) + idx;
                return (
                  <button
                    key={action.path}
                    type="button"
                    data-index={globalIdx}
                    onClick={() => handleSelect(action.path)}
                    className={`flex w-full items-center rounded-sm px-2 py-2 text-sm hover:bg-accent ${selectedIndex === globalIdx ? "bg-accent" : ""}`}
                  >
                    <action.icon className="mr-2 h-4 w-4" />
                    {action.label}
                  </button>
                );
              })}
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
              {filteredQuickCommands.map((action, idx) => {
                const globalIdx = (!hasQuery ? recentItems.length : 0) + filteredNavigation.length + idx;
                return (
                  <button
                    key={action.label}
                    type="button"
                    data-index={globalIdx}
                    onClick={() => setOpen(false)}
                    className={`flex w-full items-center rounded-sm px-2 py-2 text-sm hover:bg-accent ${selectedIndex === globalIdx ? "bg-accent" : ""}`}
                  >
                    <action.icon className="mr-2 h-4 w-4" />
                    {action.label}
                  </button>
                );
              })}
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
                <Spinner size="sm" className="mr-2" />
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
              (() => {
                let resourceIdx = (!hasQuery ? recentItems.length : 0) + filteredNavigation.length + filteredQuickCommands.length;
                return Object.entries(groupedResources).map(([kind, items]) => (
                  <div key={kind} className="space-y-1">
                    {items.map((item) => {
                      const globalIdx = resourceIdx++;
                      return (
                        <button
                          key={`${kind}-${item.namespace ?? "cluster"}-${item.name}`}
                          type="button"
                          data-index={globalIdx}
                          onClick={() => handleSelect(item.path, item.name, kind, item.namespace)}
                          className={`flex w-full items-center rounded-sm px-2 py-2 text-sm hover:bg-accent ${selectedIndex === globalIdx ? "bg-accent" : ""}`}
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
                      );
                    })}
                  </div>
                ));
              })()}
          </div>
        </div>

        {/* Footer with keyboard hints */}
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">↑↓</kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">↵</kbd>
              <span>select</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">esc</kbd>
              <span>close</span>
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
