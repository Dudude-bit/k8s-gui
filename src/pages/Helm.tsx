import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useClusterStore } from "@/stores/clusterStore";
import { useDependenciesStore } from "@/stores/dependenciesStore";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { HelmStatusBanner } from "@/components/helm/HelmStatusBanner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DangerousConfirmDialog } from "@/components/ui/dangerous-confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ColumnDef } from "@tanstack/react-table";
import { useToast } from "@/components/ui/use-toast";
import {
  RefreshCw,
  Trash2,
  History,
  FileCode,
  RotateCcw,
  Package,
  Anchor,
  PauseCircle,
  PlayCircle,
  ExternalLink,
  Plus,
  FolderGit2,
  Search,
  ArrowUpCircle,
  Download,
} from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActionMenu } from "@/components/ui/action-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { commands } from "@/lib/commands";
import type { HelmRelease, HelmRevision, HelmChartSearchResult, HelmInstallOptions } from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";
import { cn } from "@/lib/utils";

// Source icon component
function SourceIcon({ source }: { source: string }) {
  if (source === "flux") {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Anchor className="h-4 w-4 text-purple-500" />
        </TooltipTrigger>
        <TooltipContent>Flux CD HelmRelease</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger>
        <Package className="h-4 w-4 text-blue-500" />
      </TooltipTrigger>
      <TooltipContent>Native Helm Release</TooltipContent>
    </Tooltip>
  );
}

export function Helm() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected } = useClusterStore();
  const { helm, checkHelmAvailability } = useDependenciesStore();

  // State for dialogs
  const [rollbackTarget, setRollbackTarget] = useState<{
    release: HelmRelease;
    revision: number;
  } | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<HelmRelease | null>(null);
  const [historyDialog, setHistoryDialog] = useState<HelmRelease | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("releases");
  
  // Repository dialog state
  const [addRepoDialogOpen, setAddRepoDialogOpen] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoUrl, setNewRepoUrl] = useState("");
  const [deleteRepoTarget, setDeleteRepoTarget] = useState<string | null>(null);

  // Chart search state
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<HelmChartSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Install dialog state
  const [installChart, setInstallChart] = useState<HelmChartSearchResult | null>(null);
  const [installReleaseName, setInstallReleaseName] = useState("");
  const [installNamespace, setInstallNamespace] = useState("default");
  const [installVersion, setInstallVersion] = useState("");
  const [installValues, setInstallValues] = useState("");
  const [installCreateNs, setInstallCreateNs] = useState(false);
  const [installWait, setInstallWait] = useState(true);

  // Upgrade dialog state
  const [upgradeTarget, setUpgradeTarget] = useState<HelmRelease | null>(null);
  const [upgradeVersion, setUpgradeVersion] = useState("");
  const [upgradeValues, setUpgradeValues] = useState("");
  const [upgradeWait, setUpgradeWait] = useState(true);

  // Check helm availability on mount
  useEffect(() => {
    if (isConnected && !helm) {
      checkHelmAvailability();
    }
  }, [isConnected, helm, checkHelmAvailability]);

  // Fetch namespaces for filter
  const { data: namespaces = [] } = useQuery({
    queryKey: ["namespaces"],
    queryFn: async () => {
      const result = await commands.listNamespaces();
      return result.map((ns) => ns.name);
    },
    enabled: isConnected,
  });

  const helmCliAvailable = helm?.available ?? false;

  // Fetch native Helm releases
  const {
    data: releases = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["helm-releases-native", selectedNamespace],
    queryFn: async () => {
      try {
        const ns = selectedNamespace === "all" ? null : selectedNamespace;
        return await commands.listHelmReleasesNative(ns);
      } catch (err) {
        throw normalizeTauriError(err);
      }
    },
    enabled: isConnected,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Fetch history for dialog
  const { data: historyData = [], isLoading: historyLoading } = useQuery({
    queryKey: ["helm-history", historyDialog?.name, historyDialog?.namespace],
    queryFn: async () => {
      if (!historyDialog) return [];
      return await commands.getHelmHistory(historyDialog.name, historyDialog.namespace);
    },
    enabled: !!historyDialog,
  });

  // Fetch Helm repositories
  const {
    data: repositories = [],
    isLoading: reposLoading,
  } = useQuery({
    queryKey: ["helm-repos"],
    queryFn: async () => {
      try {
        return await commands.listHelmRepos();
      } catch (err) {
        // Return empty if helm not available
        console.error("Failed to list repos:", err);
        return [];
      }
    },
    enabled: helmCliAvailable,
  });

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: async ({ name, namespace, revision }: { name: string; namespace: string; revision: number }) => {
      return await commands.helmRollback(name, namespace, revision);
    },
    onSuccess: () => {
      toast({
        title: "Rollback initiated",
        description: "The release is being rolled back to the previous revision.",
      });
      queryClient.invalidateQueries({ queryKey: ["helm-releases-native"] });
      setRollbackTarget(null);
    },
    onError: (error) => {
      toast({
        title: "Rollback failed",
        description: normalizeTauriError(error),
        variant: "destructive",
      });
    },
  });

  // Uninstall mutation
  const uninstallMutation = useMutation({
    mutationFn: async ({ name, namespace }: { name: string; namespace: string }) => {
      return await commands.helmUninstall(name, namespace);
    },
    onSuccess: () => {
      toast({
        title: "Release uninstalled",
        description: "The Helm release has been successfully uninstalled.",
      });
      queryClient.invalidateQueries({ queryKey: ["helm-releases-native"] });
      setUninstallTarget(null);
    },
    onError: (error) => {
      toast({
        title: "Uninstall failed",
        description: normalizeTauriError(error),
        variant: "destructive",
      });
    },
  });

  // Add repository mutation
  const addRepoMutation = useMutation({
    mutationFn: async ({ name, url }: { name: string; url: string }) => {
      return await commands.addHelmRepo(name, url);
    },
    onSuccess: () => {
      toast({
        title: "Repository added",
        description: `Repository "${newRepoName}" has been added successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["helm-repos"] });
      setAddRepoDialogOpen(false);
      setNewRepoName("");
      setNewRepoUrl("");
    },
    onError: (error) => {
      toast({
        title: "Failed to add repository",
        description: normalizeTauriError(error),
        variant: "destructive",
      });
    },
  });

  // Remove repository mutation
  const removeRepoMutation = useMutation({
    mutationFn: async (name: string) => {
      return await commands.removeHelmRepo(name);
    },
    onSuccess: () => {
      toast({
        title: "Repository removed",
        description: "The repository has been removed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["helm-repos"] });
      setDeleteRepoTarget(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to remove repository",
        description: normalizeTauriError(error),
        variant: "destructive",
      });
    },
  });

  // Update repositories mutation
  const updateReposMutation = useMutation({
    mutationFn: async () => {
      return await commands.updateHelmRepos();
    },
    onSuccess: () => {
      toast({
        title: "Repositories updated",
        description: "All Helm repositories have been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["helm-repos"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to update repositories",
        description: normalizeTauriError(error),
        variant: "destructive",
      });
    },
  });

  // Search charts handler
  const handleSearchCharts = async () => {
    if (!searchKeyword.trim()) return;
    setIsSearching(true);
    try {
      const results = await commands.helmSearchCharts(searchKeyword);
      setSearchResults(results);
    } catch (error) {
      toast({
        title: "Search failed",
        description: normalizeTauriError(error),
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Install chart mutation
  const installMutation = useMutation({
    mutationFn: async (options: HelmInstallOptions) => {
      return await commands.helmInstall(options);
    },
    onSuccess: () => {
      toast({
        title: "Chart installed",
        description: `Release "${installReleaseName}" has been installed successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["helm-releases-native"] });
      setInstallChart(null);
      setInstallReleaseName("");
      setInstallNamespace("default");
      setInstallVersion("");
      setInstallValues("");
      setInstallCreateNs(false);
      setInstallWait(true);
    },
    onError: (error) => {
      toast({
        title: "Installation failed",
        description: normalizeTauriError(error),
        variant: "destructive",
      });
    },
  });

  // Upgrade release mutation
  const upgradeMutation = useMutation({
    mutationFn: async (options: HelmInstallOptions) => {
      return await commands.helmUpgrade(options);
    },
    onSuccess: () => {
      toast({
        title: "Release upgraded",
        description: `Release "${upgradeTarget?.name}" has been upgraded successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["helm-releases-native"] });
      setUpgradeTarget(null);
      setUpgradeVersion("");
      setUpgradeValues("");
      setUpgradeWait(true);
    },
    onError: (error) => {
      toast({
        title: "Upgrade failed",
        description: normalizeTauriError(error),
        variant: "destructive",
      });
    },
  });

  // Columns definition
  const columns: ColumnDef<HelmRelease>[] = useMemo(
    () => [
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => <SourceIcon source={row.original.source} />,
        size: 70,
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <button
            className="font-medium text-primary hover:underline text-left"
            onClick={() =>
              navigate(
                `/helm/${row.original.source}/${row.original.namespace}/${row.original.name}`
              )
            }
          >
            {row.original.name}
          </button>
        ),
      },
      {
        accessorKey: "namespace",
        header: "Namespace",
      },
      {
        accessorKey: "revision",
        header: "Rev",
        size: 60,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status;
          const suspended = row.original.suspended;
          return (
            <div className="flex items-center gap-1.5">
              <StatusBadge status={suspended ? "suspended" : status} showDot />
            </div>
          );
        },
      },
      {
        accessorKey: "chart",
        header: "Chart",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.chart}</span>
        ),
      },
      {
        accessorKey: "appVersion",
        header: "App Version",
        cell: ({ row }) => row.original.appVersion || "-",
      },
      {
        accessorKey: "updated",
        header: "Updated",
        cell: ({ row }) => {
          if (!row.original.updated) return "-";
          const date = new Date(row.original.updated);
          if (isNaN(date.getTime())) return row.original.updated;
          return date.toLocaleString();
        },
      },
      {
        id: "actions",
        size: 50,
        cell: ({ row }) => {
          const release = row.original;
          const isNative = release.source === "native";
          const isFlux = release.source === "flux";

          return (
            <ActionMenu>
              <DropdownMenuItem
                onClick={() =>
                  navigate(`/helm/${release.source}/${release.namespace}/${release.name}`)
                }
              >
                <FileCode className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setHistoryDialog(release)}>
                <History className="mr-2 h-4 w-4" />
                View History
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {isNative && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuItem
                        disabled={!helmCliAvailable}
                        onClick={() => {
                          setUpgradeTarget(release);
                          setUpgradeVersion("");
                          setUpgradeValues("");
                        }}
                      >
                        <ArrowUpCircle className="mr-2 h-4 w-4" />
                        Upgrade
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    {!helmCliAvailable && (
                      <TooltipContent>Helm CLI required</TooltipContent>
                    )}
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuItem
                        disabled={!helmCliAvailable}
                        onClick={() => {
                          if (release.revision > 1) {
                            setRollbackTarget({
                              release,
                              revision: release.revision - 1,
                            });
                          }
                        }}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Rollback
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    {!helmCliAvailable && (
                      <TooltipContent>Helm CLI required</TooltipContent>
                    )}
                  </Tooltip>

                  <DropdownMenuSeparator />

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuItem
                        disabled={!helmCliAvailable}
                        className="text-destructive"
                        onClick={() => setUninstallTarget(release)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Uninstall
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    {!helmCliAvailable && (
                      <TooltipContent>Helm CLI required</TooltipContent>
                    )}
                  </Tooltip>
                </>
              )}

              {isFlux && (
                <>
                  <DropdownMenuItem disabled>
                    {release.suspended ? (
                      <>
                        <PlayCircle className="mr-2 h-4 w-4" />
                        Resume
                      </>
                    ) : (
                      <>
                        <PauseCircle className="mr-2 h-4 w-4" />
                        Suspend
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reconcile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      navigate(
                        `/crds/helm.toolkit.fluxcd.io/helmreleases/${release.namespace}/${release.name}`
                      )
                    }
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View CRD
                  </DropdownMenuItem>
                </>
              )}
            </ActionMenu>
          );
        },
      },
    ],
    [navigate, helmCliAvailable]
  );

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="Helm releases" />;
  }

  return (
    <div className="space-y-4">
      <HelmStatusBanner />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Helm</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="releases">
            <Package className="h-4 w-4 mr-2" />
            Releases
          </TabsTrigger>
          <TabsTrigger value="charts" disabled={!helmCliAvailable}>
            <Search className="h-4 w-4 mr-2" />
            Charts
          </TabsTrigger>
          <TabsTrigger value="repositories" disabled={!helmCliAvailable}>
            <FolderGit2 className="h-4 w-4 mr-2" />
            Repositories
          </TabsTrigger>
        </TabsList>

        <TabsContent value="releases" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All namespaces" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All namespaces</SelectItem>
                  {namespaces.map((ns) => (
                    <SelectItem key={ns} value={ns}>
                      {ns}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>

          <DataTable
            columns={columns}
            data={releases}
            isLoading={isLoading}
            searchPlaceholder="Search releases..."
            searchKey="name"
          />
        </TabsContent>

        <TabsContent value="charts" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search charts (e.g., nginx, redis, postgresql)..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchCharts()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearchCharts} disabled={isSearching || !searchKeyword.trim()}>
              {isSearching ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                "Search"
              )}
            </Button>
          </div>

          {searchResults.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Search for Helm charts</p>
              <p className="text-sm">
                Add repositories first, then search for available charts
              </p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Chart</th>
                    <th className="text-left p-3 font-medium">Version</th>
                    <th className="text-left p-3 font-medium">App Version</th>
                    <th className="text-left p-3 font-medium">Description</th>
                    <th className="text-right p-3 font-medium w-[100px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((chart, idx) => (
                    <tr key={`${chart.name}-${idx}`} className="border-b last:border-0">
                      <td className="p-3 font-medium">{chart.name}</td>
                      <td className="p-3 text-muted-foreground">{chart.version}</td>
                      <td className="p-3 text-muted-foreground">{chart.appVersion || "-"}</td>
                      <td className="p-3 text-muted-foreground text-sm truncate max-w-[300px]">
                        {chart.description || "-"}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setInstallChart(chart);
                            setInstallReleaseName(chart.name.split("/").pop() || chart.name);
                            setInstallVersion(chart.version);
                          }}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Install
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="repositories" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Manage Helm chart repositories
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateReposMutation.mutate()}
                disabled={updateReposMutation.isPending}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", updateReposMutation.isPending && "animate-spin")} />
                Update All
              </Button>
              <Button
                size="sm"
                onClick={() => setAddRepoDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Repository
              </Button>
            </div>
          </div>

          {reposLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading repositories...</div>
          ) : repositories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderGit2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No repositories configured</p>
              <p className="text-sm">Add a Helm chart repository to get started</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">URL</th>
                    <th className="text-right p-3 font-medium w-[100px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {repositories.map((repo) => (
                    <tr key={repo.name} className="border-b last:border-0">
                      <td className="p-3 font-medium">{repo.name}</td>
                      <td className="p-3 text-muted-foreground">
                        <a
                          href={repo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline inline-flex items-center gap-1"
                        >
                          {repo.url}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteRepoTarget(repo.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Repository Dialog */}
      <Dialog open={addRepoDialogOpen} onOpenChange={setAddRepoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Helm Repository</DialogTitle>
            <DialogDescription>
              Add a new Helm chart repository to search and install charts from.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="repo-name">Repository Name</Label>
              <Input
                id="repo-name"
                placeholder="e.g., bitnami"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repo-url">Repository URL</Label>
              <Input
                id="repo-url"
                placeholder="e.g., https://charts.bitnami.com/bitnami"
                value={newRepoUrl}
                onChange={(e) => setNewRepoUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRepoDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addRepoMutation.mutate({ name: newRepoName, url: newRepoUrl })}
              disabled={!newRepoName || !newRepoUrl || addRepoMutation.isPending}
            >
              {addRepoMutation.isPending ? "Adding..." : "Add Repository"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Repository Confirmation */}
      <ConfirmDialog
        open={deleteRepoTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteRepoTarget(null);
        }}
        title="Remove Repository"
        description={`Are you sure you want to remove the repository "${deleteRepoTarget}"?`}
        confirmLabel="Remove"
        confirmVariant="destructive"
        confirmDisabled={removeRepoMutation.isPending}
        onConfirm={() => {
          if (deleteRepoTarget) {
            removeRepoMutation.mutate(deleteRepoTarget);
          }
        }}
      />

      {/* Install Chart Dialog */}
      <Dialog open={installChart !== null} onOpenChange={(open) => !open && setInstallChart(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Install Chart</DialogTitle>
            <DialogDescription>
              Install {installChart?.name} to your cluster
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="install-release-name">Release Name</Label>
              <Input
                id="install-release-name"
                value={installReleaseName}
                onChange={(e) => setInstallReleaseName(e.target.value)}
                placeholder="my-release"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="install-namespace">Namespace</Label>
              <Select value={installNamespace} onValueChange={setInstallNamespace}>
                <SelectTrigger>
                  <SelectValue placeholder="Select namespace" />
                </SelectTrigger>
                <SelectContent>
                  {namespaces.map((ns) => (
                    <SelectItem key={ns} value={ns}>
                      {ns}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="install-version">Version (optional)</Label>
              <Input
                id="install-version"
                value={installVersion}
                onChange={(e) => setInstallVersion(e.target.value)}
                placeholder={installChart?.version || "latest"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="install-values">Values (YAML, optional)</Label>
              <Textarea
                id="install-values"
                value={installValues}
                onChange={(e) => setInstallValues(e.target.value)}
                placeholder="# Custom values&#10;replicaCount: 2"
                className="font-mono text-sm h-32"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="install-create-ns"
                  checked={installCreateNs}
                  onCheckedChange={(checked) => setInstallCreateNs(checked === true)}
                />
                <Label htmlFor="install-create-ns" className="text-sm">Create namespace</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="install-wait"
                  checked={installWait}
                  onCheckedChange={(checked) => setInstallWait(checked === true)}
                />
                <Label htmlFor="install-wait" className="text-sm">Wait for ready</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallChart(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (installChart && installReleaseName && installNamespace) {
                  installMutation.mutate({
                    releaseName: installReleaseName,
                    chart: installChart.name,
                    namespace: installNamespace,
                    version: installVersion || null,
                    values: installValues || null,
                    createNamespace: installCreateNs,
                    wait: installWait,
                    timeout: installWait ? "5m0s" : null,
                  });
                }
              }}
              disabled={!installReleaseName || !installNamespace || installMutation.isPending}
            >
              {installMutation.isPending ? "Installing..." : "Install"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade Release Dialog */}
      <Dialog open={upgradeTarget !== null} onOpenChange={(open) => !open && setUpgradeTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upgrade Release</DialogTitle>
            <DialogDescription>
              Upgrade {upgradeTarget?.name} in namespace {upgradeTarget?.namespace}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Current Chart:</span>
                <p className="font-medium">{upgradeTarget?.chart}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Revision:</span>
                <p className="font-medium">{upgradeTarget?.revision}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="upgrade-version">New Version (optional)</Label>
              <Input
                id="upgrade-version"
                value={upgradeVersion}
                onChange={(e) => setUpgradeVersion(e.target.value)}
                placeholder="Leave empty for latest"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upgrade-values">Values (YAML, optional)</Label>
              <Textarea
                id="upgrade-values"
                value={upgradeValues}
                onChange={(e) => setUpgradeValues(e.target.value)}
                placeholder="# Custom values to merge&#10;replicaCount: 3"
                className="font-mono text-sm h-32"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="upgrade-wait"
                checked={upgradeWait}
                onCheckedChange={(checked) => setUpgradeWait(checked === true)}
              />
              <Label htmlFor="upgrade-wait" className="text-sm">Wait for ready</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (upgradeTarget) {
                  upgradeMutation.mutate({
                    releaseName: upgradeTarget.name,
                    chart: upgradeTarget.chart,
                    namespace: upgradeTarget.namespace,
                    version: upgradeVersion || null,
                    values: upgradeValues || null,
                    createNamespace: false,
                    wait: upgradeWait,
                    timeout: upgradeWait ? "5m0s" : null,
                  });
                }
              }}
              disabled={upgradeMutation.isPending}
            >
              {upgradeMutation.isPending ? "Upgrading..." : "Upgrade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      {historyDialog && (
        <HistoryDialog
          release={historyDialog}
          history={historyData}
          isLoading={historyLoading}
          helmCliAvailable={helmCliAvailable}
          onClose={() => setHistoryDialog(null)}
          onRollback={(revision) => {
            setRollbackTarget({ release: historyDialog, revision });
            setHistoryDialog(null);
          }}
        />
      )}

      {/* Rollback confirmation */}
      <ConfirmDialog
        open={rollbackTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRollbackTarget(null);
        }}
        title="Rollback Release"
        description={
          rollbackTarget
            ? `Are you sure you want to rollback "${rollbackTarget.release.name}" to revision ${rollbackTarget.revision}?`
            : undefined
        }
        confirmLabel="Rollback"
        confirmVariant="default"
        confirmDisabled={rollbackMutation.isPending}
        onConfirm={() => {
          if (rollbackTarget) {
            rollbackMutation.mutate({
              name: rollbackTarget.release.name,
              namespace: rollbackTarget.release.namespace,
              revision: rollbackTarget.revision,
            });
          }
        }}
      />

      {/* Uninstall confirmation (dangerous) */}
      <DangerousConfirmDialog
        open={uninstallTarget !== null}
        onOpenChange={(open) => {
          if (!open) setUninstallTarget(null);
        }}
        title="Uninstall Release"
        description={
          uninstallTarget
            ? `This will permanently delete the Helm release "${uninstallTarget.name}" and all its resources from namespace "${uninstallTarget.namespace}". This action cannot be undone.`
            : undefined
        }
        confirmationText={uninstallTarget?.name ?? ""}
        confirmLabel="Uninstall"
        isLoading={uninstallMutation.isPending}
        onConfirm={() => {
          if (uninstallTarget) {
            uninstallMutation.mutate({
              name: uninstallTarget.name,
              namespace: uninstallTarget.namespace,
            });
          }
        }}
      />
    </div>
  );
}

// History Dialog component
interface HistoryDialogProps {
  release: HelmRelease;
  history: HelmRevision[];
  isLoading: boolean;
  helmCliAvailable: boolean;
  onClose: () => void;
  onRollback: (revision: number) => void;
}

function HistoryDialog({
  release,
  history,
  isLoading,
  helmCliAvailable,
  onClose,
  onRollback,
}: HistoryDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            History: {release.name}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">
              Loading history...
            </div>
          ) : history.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No history found
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Rev</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Chart</th>
                  <th className="text-left p-2">Updated</th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-right p-2"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((rev) => (
                  <tr key={rev.revision} className="border-b last:border-0">
                    <td className="p-2 font-medium">{rev.revision}</td>
                    <td className="p-2">
                      <StatusBadge status={rev.status} />
                    </td>
                    <td className="p-2 text-muted-foreground">{rev.chart}</td>
                    <td className="p-2 text-muted-foreground">
                      {rev.updated ? new Date(rev.updated).toLocaleString() : "-"}
                    </td>
                    <td className="p-2 text-muted-foreground truncate max-w-[150px]">
                      {rev.description || "-"}
                    </td>
                    <td className="p-2 text-right">
                      {rev.revision < release.revision && helmCliAvailable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRollback(rev.revision)}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Rollback
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default Helm;
