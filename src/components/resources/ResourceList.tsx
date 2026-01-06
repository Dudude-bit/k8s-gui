import { ReactNode, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { DataTable } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/use-toast";
import { ResourceListHeader } from "@/components/resources/ResourceListHeader";
import { useResource } from "@/hooks/useResource";
import { useResourceWatch, type ResourceKind } from "@/hooks/useResourceWatch";
import { useClusterStore } from "@/stores/clusterStore";

export interface ResourceDeleteConfig<T> {
  /** Function to delete a resource */
  mutationFn: (item: T) => Promise<void>;
  /** Query keys to invalidate after deletion */
  invalidateQueryKeys: string[][];
  /** Resource type name for messages */
  resourceType: string;
}

export interface ResourceListProps<
  T extends { name: string; namespace: string },
> {
  /** Display title for the resource list */
  title: string;
  /** Query key for React Query */
  queryKey: string[];
  /** Function to fetch resources */
  queryFn: () => Promise<T[]>;
  /** Table column definitions - can use setDeleteTarget from useResourceListDelete hook */
  columns:
  | ColumnDef<T>[]
  | ((setDeleteTarget: (item: T) => void) => ColumnDef<T>[]);
  /** Label for empty state (e.g., "pods", "services") */
  emptyStateLabel: string;
  /** Delete configuration */
  deleteConfig?: ResourceDeleteConfig<T>;
  /** Optional stale time override (default: 5000ms) */
  staleTime?: number;
  /** Optional refetch interval (default: undefined - no auto refetch) */
  refetchInterval?: number;
  /** Optional custom header actions */
  headerActions?: ReactNode;
  /** Resource type for real-time watch */
  watchResourceType?: ResourceKind;
}

export function ResourceList<T extends { name: string; namespace: string }>({
  title,
  queryKey,
  queryFn,
  columns,
  emptyStateLabel,
  deleteConfig,
  staleTime,
  refetchInterval,
  headerActions,
  watchResourceType,
}: ResourceListProps<T>) {
  const { isConnected, currentNamespace } = useClusterStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  const {
    data: resources = [],
    isLoading,
    isFetching,
    refetch,
  } = useResource(queryKey, queryFn, {
    staleTime: staleTime ?? 5000,
    refetchInterval,
  });

  // Real-time watch for automatic updates
  const { isWatching } = useResourceWatch({
    resourceType: watchResourceType ?? "",
    namespace: currentNamespace,
    enabled: isConnected && !!watchResourceType,
    queryKeysToInvalidate: deleteConfig?.invalidateQueryKeys ?? [queryKey],
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (item: T) => {
      if (deleteConfig) {
        await deleteConfig.mutationFn(item);
      }
    },
    onSuccess: (_, item) => {
      if (deleteConfig) {
        deleteConfig.invalidateQueryKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
        toast({
          title: `${deleteConfig.resourceType} deleted`,
          description: `${deleteConfig.resourceType} ${item.name} has been deleted.`,
        });
      }
      setDeleteTarget(null);
    },
    onError: (error, item) => {
      toast({
        title: "Error",
        description: `Failed to delete ${deleteConfig?.resourceType?.toLowerCase() ?? "resource"} ${item.name}: ${error}`,
        variant: "destructive",
      });
      setDeleteTarget(null);
    },
  });

  // Resolve columns - can be a function that receives setDeleteTarget
  const resolvedColumns =
    typeof columns === "function"
      ? columns(setDeleteTarget as (item: T) => void)
      : columns;

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel={emptyStateLabel} />;
  }

  const showSkeleton = isLoading && resources.length === 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <ResourceListHeader
        title={title}
        isFetching={isFetching}
        isLoading={isLoading}
        onRefresh={() => refetch()}
        actions={headerActions}
        isWatching={isWatching}
      />
      <DataTable
        columns={resolvedColumns}
        data={resources}
        isLoading={showSkeleton}
        isFetching={isFetching && !isLoading}
      />
      {deleteConfig && (
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTarget(null);
            }
          }}
          title={`Delete ${deleteConfig.resourceType.toLowerCase()}?`}
          description={
            deleteTarget
              ? `This will delete ${deleteTarget.name} in ${deleteTarget.namespace}.`
              : undefined
          }
          confirmLabel="Delete"
          confirmVariant="destructive"
          confirmDisabled={deleteMutation.isPending}
          onConfirm={() => {
            if (deleteTarget) {
              deleteMutation.mutate(deleteTarget);
            }
          }}
        />
      )}
    </div>
  );
}
