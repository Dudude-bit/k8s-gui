// Hook for fetching pod metrics with real-time updates

import { useQuery, keepPreviousData, UseQueryOptions } from "@tanstack/react-query";
import { invokeTyped } from "@/lib/tauri";

export interface PodMetrics {
  name: string;
  namespace: string;
  cpu_usage: string | null;
  memory_usage: string | null;
}

export function usePodMetrics(
  namespace: string | null | undefined,
  options?: Omit<UseQueryOptions<PodMetrics[]>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["pod-metrics", namespace],
    queryFn: async () => {
      return invokeTyped<PodMetrics[]>("get_pods_metrics", {
        namespace: namespace || null,
      });
    },
    refetchInterval: 8000, // 8 seconds for real-time updates
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    ...options,
  });
}

