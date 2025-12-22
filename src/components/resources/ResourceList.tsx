import { ReactNode } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { useResourceQuery } from "@/hooks/useResourceQuery";
import { useResourceListDelete, UseResourceListDeleteConfig } from "@/hooks/useResourceListDelete";
import { ResourceListHeader } from "@/components/resources/ResourceListHeader";
import { useClusterStore } from "@/stores/clusterStore";

export interface ResourceListProps<T extends { name: string; namespace: string }> {
  /** Display title for the resource list */
  title: string;
  /** Query key for React Query */
  queryKey: string[];
  /** Function to fetch resources */
  queryFn: () => Promise<T[]>;
  /** Table column definitions - can use setDeleteTarget from useResourceListDelete hook */
  columns: ColumnDef<T>[] | ((setDeleteTarget: (item: T) => void) => ColumnDef<T>[]);
  /** Label for empty state (e.g., "pods", "services") */
  emptyStateLabel: string;
  /** Optional delete mutation configuration */
  deleteConfig?: UseResourceListDeleteConfig<T>;
  /** Optional stale time override (default: 5000ms) */
  staleTime?: number;
  /** Optional refetch interval (default: undefined - no auto refetch) */
  refetchInterval?: number;
  /** Optional custom header actions */
  headerActions?: ReactNode;
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
}: ResourceListProps<T>) {
  const { isConnected } = useClusterStore();
  
  // Setup delete functionality if configured
  const deleteHook = deleteConfig ? useResourceListDelete(deleteConfig) : null;
  const deleteTarget = deleteHook?.deleteTarget ?? null;
  const setDeleteTarget = deleteHook?.setDeleteTarget ?? (() => {});
  const deleteMutation = deleteHook?.deleteMutation ?? null;

  const {
    data: resources = [],
    isLoading,
    isFetching,
    refetch,
  } = useResourceQuery(queryKey, queryFn, {
    staleTime: staleTime ?? 5000,
    refetchInterval,
  });

  // Resolve columns - can be a function that receives setDeleteTarget
  const resolvedColumns = typeof columns === "function" 
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
      />
      <DataTable
        columns={resolvedColumns}
        data={resources}
        isLoading={showSkeleton}
        isFetching={isFetching && !isLoading}
      />
      {deleteConfig && deleteTarget && deleteMutation && (
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTarget(null);
            }
          }}
          title={`Delete ${title.toLowerCase().replace(/s$/, '')}?`}
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
