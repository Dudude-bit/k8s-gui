import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ColumnDef } from "@tanstack/react-table";
import {
  Eye,
  Trash2,
  ChevronDown,
  ChevronRight,
  Puzzle,
  List,
} from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { DataTable } from "@/components/ui/data-table";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { useClusterStore } from "@/stores/clusterStore";
import { ResourceListHeader } from "@/components/resources/ResourceListHeader";
import { createAgeColumn } from "@/components/resources/columns";
import { normalizeTauriError } from "@/lib/error-utils";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { commands } from "@/lib/commands";
import { REFRESH_INTERVALS, STALE_TIMES } from "@/lib/refresh";
import type { CrdInfo } from "@/generated/types";

// Extend CrdInfo with a namespace field for ResourceList compatibility
type CrdListItem = CrdInfo & { namespace: string };

export function Crds() {
  const { isConnected } = useClusterStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<CrdListItem | null>(null);

  const {
    data: crdGroups = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["crds", "grouped"],
    queryFn: async () => {
      try {
        return await commands.listCrds(true);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: isConnected,
    staleTime: STALE_TIMES.resourceList,
    refetchInterval: REFRESH_INTERVALS.slow,
  });

  const deleteMutation = useMutation({
    mutationFn: async (item: CrdListItem) => {
      try {
        await commands.deleteCrd(item.name);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    onSuccess: (_, item) => {
      toast({
        title: "CRD deleted",
        description: `${item.name} has been deleted.`,
      });
      queryClient.invalidateQueries({ queryKey: ["crds"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete CRD",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedGroups(new Set(crdGroups.map((g) => g.group)));
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  const columns = useMemo<ColumnDef<CrdListItem>[]>(
    () => [
      {
        accessorKey: "kind",
        header: "Kind",
        cell: ({ row }) => (
          <Link
            to={`/${toPlural(ResourceType.CustomResourceDefinition)}/${encodeURIComponent(row.original.name)}`}
            className="font-medium text-primary hover:underline"
          >
            {row.original.kind}
          </Link>
        ),
      },
      {
        accessorKey: "plural",
        header: "Plural",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.plural}</span>
        ),
      },
      {
        accessorKey: "scope",
        header: "Scope",
        cell: ({ row }) => (
          <Badge
            variant={row.original.scope === "Namespaced" ? "default" : "secondary"}
          >
            {row.original.scope}
          </Badge>
        ),
      },
      {
        accessorKey: "version",
        header: "Version",
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.version}</Badge>
        ),
      },
      {
        accessorKey: "shortNames",
        header: "Short Names",
        cell: ({ row }) => {
          const shortNames = row.original.shortNames;
          if (!shortNames || shortNames.length === 0) {
            return <span className="text-muted-foreground">-</span>;
          }
          return (
            <div className="flex gap-1 flex-wrap">
              {shortNames.map((sn) => (
                <Badge key={sn} variant="outline" className="text-xs">
                  {sn}
                </Badge>
              ))}
            </div>
          );
        },
      },
      createAgeColumn<CrdListItem>(),
      {
        id: "actions",
        cell: ({ row }) => (
          <ActionMenu>
            <DropdownMenuItem asChild>
              <Link to={`/${toPlural(ResourceType.CustomResourceDefinition)}/${encodeURIComponent(row.original.name)}`}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={`/${toPlural(ResourceType.CustomResourceDefinition)}/${encodeURIComponent(row.original.name)}/instances`}>
                <List className="mr-2 h-4 w-4" />
                View Instances
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </ActionMenu>
        ),
      },
    ],
    []
  );

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="CRDs" />;
  }

  // Calculate total CRDs count
  const totalCrds = crdGroups.reduce((acc, g) => acc + g.crds.length, 0);

  return (
    <div className="space-y-4">
      <ResourceListHeader
        title={`Custom Resource Definitions (${totalCrds})`}
        isLoading={isLoading}
        isFetching={isFetching}
        onRefresh={() => refetch()}
      />

      {/* Group controls */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={expandAll}>
          Expand All
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>
          Collapse All
        </Button>
      </div>

      {/* Grouped CRD list */}
      <div className="space-y-2">
        {crdGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.group);
          const crdsWithNamespace: CrdListItem[] = group.crds.map((crd) => ({
            ...crd,
            namespace: "", // CRDs are cluster-scoped
          }));

          return (
            <div
              key={group.group}
              className="border rounded-lg overflow-hidden"
            >
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.group)}
                className="w-full flex items-center justify-between p-3 bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <Puzzle className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {group.group || "core"}
                  </span>
                </div>
                <Badge variant="secondary">{group.crds.length} CRDs</Badge>
              </button>

              {/* Group content */}
              {isExpanded && (
                <div className="p-2">
                  <DataTable
                    columns={columns}
                    data={crdsWithNamespace}
                    isLoading={isLoading}
                    searchPlaceholder="Search CRDs..."
                    searchKey="kind"
                    getRowHref={(row) => `/${toPlural(ResourceType.CustomResourceDefinition)}/${encodeURIComponent(row.name)}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete CRD?"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This will also delete all instances of this custom resource.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        confirmDisabled={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}
