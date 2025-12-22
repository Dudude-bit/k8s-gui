import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { usePodMetrics, type PodMetrics } from "@/hooks/usePodMetrics";
import type { PodInfo } from "@/types/kubernetes";

export interface PodWithMetrics extends PodInfo {
  cpu_usage: string | null;
  memory_usage: string | null;
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
  const enabled = isConnected && (options?.enabled !== false);

  // Fetch pods - cached by TanStack Query
  const {
    data: pods = [],
    isLoading: isLoadingPods,
    isFetching: isFetchingPods,
    refetch: refetchPods,
  } = useQuery({
    queryKey: ["pods", currentNamespace],
    queryFn: async () => {
      const result = await invoke<PodInfo[]>("list_pods", {
        filters: { namespace: currentNamespace },
      });
      return result;
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
        cpu_usage: metrics?.cpu_usage ?? pod.cpu_usage ?? null,
        memory_usage: metrics?.memory_usage ?? pod.memory_usage ?? null,
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

/**
 * Hook that provides pods with metrics for a specific namespace.
 * Uses the centralized caching from usePodsWithMetrics.
 */
export function useNamespacePodsWithMetrics(namespace: string | null | undefined) {
  const { isConnected } = useClusterStore();

  // Fetch pods for the specific namespace
  const {
    data: pods = [],
    isLoading: isLoadingPods,
    isFetching: isFetchingPods,
  } = useQuery({
    queryKey: ["pods", namespace],
    queryFn: async () => {
      const result = await invoke<PodInfo[]>("list_pods", {
        filters: { namespace: namespace || undefined },
      });
      return result;
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 10000,
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
  });

  // Fetch pod metrics
  const { data: podMetrics = [] } = usePodMetrics(namespace || undefined);

  // Merge pods with metrics
  const podsWithMetrics = useMemo<PodWithMetrics[]>(() => {
    return pods.map((pod) => {
      const metrics = podMetrics.find(
        (m: PodMetrics) => m.name === pod.name && m.namespace === pod.namespace
      );
      return {
        ...pod,
        cpu_usage: metrics?.cpu_usage ?? pod.cpu_usage ?? null,
        memory_usage: metrics?.memory_usage ?? pod.memory_usage ?? null,
      };
    });
  }, [pods, podMetrics]);

  return {
    data: podsWithMetrics,
    isLoading: isLoadingPods,
    isFetching: isFetchingPods,
  };
}

