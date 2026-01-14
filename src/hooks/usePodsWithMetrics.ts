import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { commands } from "@/lib/commands";
import { useClusterStore } from "@/stores/clusterStore";
import { normalizeTauriError } from "@/lib/error-utils";
import { useMetrics } from "@/hooks/useMetrics";
import { mergePodsWithMetrics, type PodWithMetrics } from "@/lib/metrics";
import { REFRESH_INTERVALS, STALE_TIMES } from "@/lib/refresh";
import { queryKeys } from "@/lib/query-keys";

export type { PodWithMetrics } from "@/lib/metrics";

interface UsePodsWithMetricsOptions {
  /** Whether the query should be enabled (default: true when connected) */
  enabled?: boolean;
}

/**
 * Centralized hook for fetching pods with their metrics.
 * This hook is shared across components to avoid duplicate queries.
 *
 * TanStack Query handles caching, so multiple components using this hook
 * with the same namespace will share the cached data.
 */
export function usePodsWithMetrics(options?: UsePodsWithMetricsOptions) {
  const { isConnected, currentNamespace } = useClusterStore();
  const enabled = isConnected && options?.enabled !== false;

  // Fetch pods - cached by TanStack Query
  const {
    data: pods = [],
    isLoading: isLoadingPods,
    dataUpdatedAt,
  } = useQuery({
    queryKey: queryKeys.pods(currentNamespace),
    queryFn: async () => {
      try {
        return await commands.listPods({
          namespace: currentNamespace || null,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
          statusFilter: null,
          selector: null,
          nodeName: null,
        });
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIMES.resourceList,
    refetchInterval: REFRESH_INTERVALS.resourceList,
    refetchOnWindowFocus: false,
  });

  const {
    podMetrics,
    podStatus,
    podMetricsQuery: {
      isLoading: isLoadingMetrics,
    },
  } = useMetrics({
    namespace: currentNamespace || null,
    enabled,
    includeNodes: false,
    includeCluster: false,
  });

  // Merge pods with their metrics - memoized for performance
  const podsWithMetrics = useMemo<PodWithMetrics[]>(() => {
    return mergePodsWithMetrics(pods, podMetrics);
  }, [pods, podMetrics]);

  return {
    data: podsWithMetrics,
    pods,
    podMetrics,
    podStatus,
    isLoading: isLoadingPods || isLoadingMetrics,
    dataUpdatedAt,
  };
}
