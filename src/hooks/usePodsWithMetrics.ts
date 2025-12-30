import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import { useClusterStore } from "@/stores/clusterStore";
import { usePodMetrics, type PodMetrics } from "@/hooks/usePodMetrics";
import type { PodInfo } from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";

export interface PodWithMetrics extends PodInfo {
  cpuUsage: string | null;
  memoryUsage: string | null;
}

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
    isFetching: isFetchingPods,
    refetch: refetchPods,
  } = useQuery({
    queryKey: ["pods", currentNamespace],
    queryFn: async () => {
      try {
        return await commands.listPods({
          namespace: currentNamespace || null,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
          statusFilter: null,
        });
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 10000,
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
  });

  // Fetch pod metrics - also cached by TanStack Query
  const {
    data: podMetrics = [],
    isLoading: isLoadingMetrics,
    isFetching: isFetchingMetrics,
  } = usePodMetrics(currentNamespace || undefined, {
    enabled,
  });

  // Merge pods with their metrics - memoized for performance
  const podsWithMetrics = useMemo<PodWithMetrics[]>(() => {
    return pods.map((pod) => {
      const metrics = podMetrics.find(
        (m: PodMetrics) => m.name === pod.name && m.namespace === pod.namespace
      );
      return {
        ...pod,
        cpuUsage: metrics?.cpuUsage ?? null,
        memoryUsage: metrics?.memoryUsage ?? null,
      };
    });
  }, [pods, podMetrics]);

  return {
    data: podsWithMetrics,
    pods,
    podMetrics,
    isLoading: isLoadingPods || isLoadingMetrics,
    isFetching: isFetchingPods || isFetchingMetrics,
    refetch: refetchPods,
  };
}
