/**
 * useResourceWatch - Hook for real-time resource updates via Kubernetes Watch API
 *
 * Uses WatchManager singleton to share watch subscriptions across components.
 * Automatically invalidates React Query cache when resources change.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useClusterStore } from "@/stores/clusterStore";
import {
  WatchManager,
  WatchEventPayload,
  listActiveWatches,
} from "@/lib/WatchManager";
import type { WatchInfo } from "@/generated/types";
import { ResourceType, type ResourceKind } from "@/lib/resource-types";

// Re-export types and utilities
export type { WatchEventPayload, WatchInfo, ResourceKind };
export { listActiveWatches, ResourceType };

/** Options for useResourceWatch hook */
export interface UseResourceWatchOptions {
  /** Resource type to watch - use ResourceType.Pod, ResourceType.Deployment, etc. */
  resourceType: ResourceKind | string;
  /** Namespace to watch (null for all namespaces or cluster-scoped resources) */
  namespace?: string | null;
  /** Enable/disable watch (useful for conditional watching) */
  enabled?: boolean;
  /** Query keys to invalidate when resource changes */
  queryKeysToInvalidate: string[][];
  /** Optional label selector for filtering */
  labelSelector?: string;
  /** Callback when a resource is added */
  onAdded?: (resource: Record<string, unknown>) => void;
  /** Callback when a resource is modified */
  onModified?: (resource: Record<string, unknown>) => void;
  /** Callback when a resource is deleted */
  onDeleted?: (resource: Record<string, unknown>) => void;
}

/** Return type for useResourceWatch hook */
export interface UseResourceWatchReturn {
  /** Whether watch is currently active */
  isWatching: boolean;
  /** Any error that occurred */
  error: Error | null;
}

/**
 * Hook for subscribing to real-time resource updates
 *
 * Uses WatchManager singleton - multiple components watching the same resource
 * will share a single backend watch subscription.
 *
 * @example
 * ```tsx
 * const { isWatching } = useResourceWatch({
 *   resourceType: ResourceType.Pod,
 *   namespace: currentNamespace,
 *   enabled: isConnected,
 *   queryKeysToInvalidate: [["pods"], ["pods-list-view"]],
 * });
 * ```
 */
export function useResourceWatch(
  options: UseResourceWatchOptions
): UseResourceWatchReturn {
  const {
    resourceType,
    namespace,
    enabled = true,
    queryKeysToInvalidate,
    labelSelector,
    onAdded,
    onModified,
    onDeleted,
  } = options;

  const queryClient = useQueryClient();
  const isConnected = useClusterStore((state) => state.isConnected);
  const currentContext = useClusterStore((state) => state.currentContext);

  const [isWatching, setIsWatching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track unsubscribe function
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Memoize the event handler to avoid recreating on every render
  const handleEvent = useCallback(
    (event: WatchEventPayload) => {
      // Invalidate queries to refresh data
      queryKeysToInvalidate.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey });
      });

      // Call appropriate callback
      switch (event.event_type) {
        case "ADDED":
          onAdded?.(event.resource);
          break;
        case "MODIFIED":
          onModified?.(event.resource);
          break;
        case "DELETED":
          onDeleted?.(event.resource);
          break;
      }
    },
    [queryClient, queryKeysToInvalidate, onAdded, onModified, onDeleted]
  );

  // Subscribe/unsubscribe based on enabled state and context
  useEffect(() => {
    if (!enabled || !isConnected) {
      // Cleanup existing subscription
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setIsWatching(false);
      return;
    }

    // Subscribe to watch events
    let isMounted = true;

    const subscribe = async () => {
      try {
        setError(null);
        const unsubscribe = await WatchManager.subscribe(
          resourceType,
          namespace ?? null,
          handleEvent,
          labelSelector
        );

        if (isMounted) {
          unsubscribeRef.current = unsubscribe;
          setIsWatching(
            WatchManager.isWatching(resourceType, namespace ?? null, labelSelector)
          );
        } else {
          // Component unmounted during subscribe, cleanup
          unsubscribe();
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsWatching(false);
        }
      }
    };

    subscribe();

    return () => {
      isMounted = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setIsWatching(false);
    };
  }, [
    enabled,
    isConnected,
    resourceType,
    namespace,
    labelSelector,
    currentContext, // Restart when context changes
    handleEvent,
  ]);

  return {
    isWatching,
    error,
  };
}
