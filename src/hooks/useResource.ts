/**
 * Unified Resource Hooks
 * 
 * Consolidates common patterns for resource data fetching, mutations, and deletions.
 * Replaces useResourceQuery, useResourceListQuery, useResourceMutation, useResourceListDelete
 * with a unified API.
 */

import { useState, useCallback } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  UseQueryOptions,
  UseMutationOptions,
} from "@tanstack/react-query";
import { useClusterStore } from "@/stores/clusterStore";
import { useToast } from "@/components/ui/use-toast";

// ============================================================================
// Query Hooks
// ============================================================================

export interface UseResourceOptions<TData = unknown, TError = Error>
  extends Partial<UseQueryOptions<TData, TError>> {
  /** Override the isConnected check */
  ignoreConnection?: boolean;
}

/**
 * Base hook for resource queries with standardized defaults
 * 
 * @example
 * const { data, isLoading } = useResource(
 *   ['pod', namespace, name],
 *   () => invoke<PodInfo>('get_pod', { name, namespace })
 * );
 */
export function useResource<TData = unknown, TError = Error>(
  queryKey: string[],
  queryFn: () => Promise<TData>,
  options?: UseResourceOptions<TData, TError>
) {
  const isConnected = useClusterStore((state) => state.isConnected);
  const { ignoreConnection, ...queryOptions } = options ?? {};

  return useQuery({
    queryKey,
    queryFn,
    enabled: (ignoreConnection || isConnected) && (queryOptions?.enabled !== false),
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    ...queryOptions,
  });
}

/**
 * Hook for resource list queries with longer stale time
 * 
 * @example
 * const { data: pods } = useResourceList(
 *   ['pods', namespace],
 *   () => invoke<PodInfo[]>('list_pods', { filters: { namespace } })
 * );
 */
export function useResourceList<TData = unknown, TError = Error>(
  queryKey: string[],
  queryFn: () => Promise<TData>,
  options?: UseResourceOptions<TData, TError>
) {
  return useResource(queryKey, queryFn, {
    staleTime: 10000,
    ...options,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export interface MutationToastConfig<TData, TVariables> {
  /** Success toast title */
  successTitle: string;
  /** Success toast description (can be function) */
  successDescription?: string | ((data: TData, variables: TVariables) => string);
  /** Error message prefix */
  errorPrefix: string;
}

export interface UseResourceMutationOptions<TData, TVariables, TError = Error> {
  /** Toast notification config */
  toast: MutationToastConfig<TData, TVariables>;
  /** Query keys to invalidate on success */
  invalidateQueryKeys?: string[][];
  /** Additional onSuccess callback */
  onSuccess?: (data: TData, variables: TVariables) => void;
  /** Additional onError callback */
  onError?: (error: TError, variables: TVariables) => void;
}

/**
 * Hook for resource mutations with standardized toast notifications and query invalidation
 * 
 * @example
 * const deletePod = useResourceMutation(
 *   (name: string) => invoke('delete_pod', { name, namespace }),
 *   {
 *     toast: {
 *       successTitle: 'Pod deleted',
 *       successDescription: 'Pod has been deleted successfully',
 *       errorPrefix: 'Failed to delete pod',
 *     },
 *     invalidateQueryKeys: [['pods']],
 *   }
 * );
 */
export function useResourceMutation<TData = unknown, TVariables = void, TError = Error>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: UseResourceMutationOptions<TData, TVariables, TError>
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation<TData, TError, TVariables>({
    mutationFn,
    onSuccess: (data, variables) => {
      // Invalidate queries
      if (options.invalidateQueryKeys) {
        options.invalidateQueryKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
      
      // Show success toast
      const description = typeof options.toast.successDescription === 'function'
        ? options.toast.successDescription(data, variables)
        : options.toast.successDescription;
      
      toast({
        title: options.toast.successTitle,
        description,
      });
      
      // Call additional callback
      options.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: 'Error',
        description: `${options.toast.errorPrefix}: ${errorMessage}`,
        variant: 'destructive',
      });
      options.onError?.(error, variables);
    },
  } as UseMutationOptions<TData, TError, TVariables>);
}

// ============================================================================
// Delete Hook with Confirmation
// ============================================================================

export interface ResourceWithIdentity {
  name: string;
  namespace: string;
}

export interface UseResourceDeleteConfig<T extends ResourceWithIdentity> {
  /** Function to delete a resource */
  mutationFn: (item: T) => Promise<void>;
  /** Query keys to invalidate after deletion */
  invalidateQueryKeys: string[][];
  /** Resource type name for messages (e.g., "Pod", "Deployment") */
  resourceType: string;
  /** Custom success message */
  successMessage?: string;
}

/**
 * Hook for resource deletion with confirmation dialog state management
 * 
 * @example
 * const { deleteTarget, setDeleteTarget, confirmDelete, isDeleting } = useResourceDelete({
 *   mutationFn: (pod) => invoke('delete_pod', { name: pod.name, namespace: pod.namespace }),
 *   invalidateQueryKeys: [['pods']],
 *   resourceType: 'Pod',
 * });
 */
export function useResourceDelete<T extends ResourceWithIdentity>(
  config: UseResourceDeleteConfig<T>
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (item: T) => {
      await config.mutationFn(item);
    },
    onSuccess: (_, item) => {
      // Invalidate queries
      config.invalidateQueryKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      
      toast({
        title: `${config.resourceType} deleted`,
        description: config.successMessage ?? `${config.resourceType} ${item.name} has been deleted.`,
      });
      setDeleteTarget(null);
    },
    onError: (error, item) => {
      toast({
        title: 'Error',
        description: `Failed to delete ${config.resourceType.toLowerCase()} ${item.name}: ${error}`,
        variant: 'destructive',
      });
      setDeleteTarget(null);
    },
  });

  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget);
    }
  }, [deleteTarget, deleteMutation]);

  const cancelDelete = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  return {
    deleteTarget,
    setDeleteTarget,
    confirmDelete,
    cancelDelete,
    isDeleting: deleteMutation.isPending,
    deleteMutation,
  };
}

// ============================================================================
// Combined CRUD Hook
// ============================================================================

export interface UseResourceCrudConfig<T extends ResourceWithIdentity, TCreate = Partial<T>, TUpdate = Partial<T>> {
  /** Resource type name */
  resourceType: string;
  /** Query key prefix */
  queryKeyPrefix: string;
  /** List query function */
  listFn: () => Promise<T[]>;
  /** Get single resource function */
  getFn?: (name: string, namespace: string) => Promise<T>;
  /** Create resource function */
  createFn?: (data: TCreate) => Promise<T>;
  /** Update resource function */
  updateFn?: (name: string, namespace: string, data: TUpdate) => Promise<T>;
  /** Delete resource function */
  deleteFn?: (name: string, namespace: string) => Promise<void>;
}

/**
 * Comprehensive CRUD hook for resources
 * 
 * @example
 * const crud = useResourceCrud({
 *   resourceType: 'ConfigMap',
 *   queryKeyPrefix: 'configmaps',
 *   listFn: () => invoke('list_configmaps', { filters: {} }),
 *   getFn: (name, namespace) => invoke('get_configmap', { name, namespace }),
 *   createFn: (data) => invoke('create_configmap', data),
 *   updateFn: (name, namespace, data) => invoke('update_configmap', { name, namespace, ...data }),
 *   deleteFn: (name, namespace) => invoke('delete_configmap', { name, namespace }),
 * });
 */
export function useResourceCrud<T extends ResourceWithIdentity, TCreate = Partial<T>, TUpdate = Partial<T>>(
  config: UseResourceCrudConfig<T, TCreate, TUpdate>
) {
  // List query
  const listQuery = useResourceList<T[]>(
    [config.queryKeyPrefix],
    config.listFn
  );

  // Create mutation
  const createMutation = config.createFn
    ? useResourceMutation(config.createFn, {
        toast: {
          successTitle: `${config.resourceType} created`,
          successDescription: (data) => `${config.resourceType} ${data.name} has been created.`,
          errorPrefix: `Failed to create ${config.resourceType.toLowerCase()}`,
        },
        invalidateQueryKeys: [[config.queryKeyPrefix]],
      })
    : null;

  // Update mutation
  const updateMutation = config.updateFn
    ? useResourceMutation(
        ({ name, namespace, data }: { name: string; namespace: string; data: TUpdate }) =>
          config.updateFn!(name, namespace, data),
        {
          toast: {
            successTitle: `${config.resourceType} updated`,
            successDescription: `${config.resourceType} has been updated.`,
            errorPrefix: `Failed to update ${config.resourceType.toLowerCase()}`,
          },
          invalidateQueryKeys: [[config.queryKeyPrefix]],
        }
      )
    : null;

  // Delete with confirmation
  const deleteState = config.deleteFn
    ? useResourceDelete<T>({
        mutationFn: (item) => config.deleteFn!(item.name, item.namespace),
        invalidateQueryKeys: [[config.queryKeyPrefix]],
        resourceType: config.resourceType,
      })
    : null;

  return {
    // List
    items: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    error: listQuery.error,
    refetch: listQuery.refetch,

    // Create
    create: createMutation?.mutate,
    isCreating: createMutation?.isPending ?? false,

    // Update
    update: updateMutation?.mutate,
    isUpdating: updateMutation?.isPending ?? false,

    // Delete
    deleteTarget: deleteState?.deleteTarget ?? null,
    setDeleteTarget: deleteState?.setDeleteTarget ?? (() => {}),
    confirmDelete: deleteState?.confirmDelete ?? (() => {}),
    cancelDelete: deleteState?.cancelDelete ?? (() => {}),
    isDeleting: deleteState?.isDeleting ?? false,
  };
}

