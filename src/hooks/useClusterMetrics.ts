// Hook for fetching cluster metrics with real-time updates

import { useQuery, keepPreviousData, UseQueryOptions } from "@tanstack/react-query";
import { invokeTyped } from "@/lib/tauri";

export interface ClusterMetrics {
  total_cpu_usage: string | null;
  total_memory_usage: string | null;
  total_cpu_capacity: string | null;
  total_memory_capacity: string | null;
}

export function useClusterMetrics(
  options?: Omit<UseQueryOptions<ClusterMetrics>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["cluster-metrics"],
    queryFn: async () => {
      return invokeTyped<ClusterMetrics>("get_cluster_metrics", {});
    },
    refetchInterval: 10000, // 10 seconds for real-time updates
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    ...options,
  });
}

