// Hook for fetching node metrics with real-time updates

import { useQuery, keepPreviousData, UseQueryOptions } from "@tanstack/react-query";
import { invokeTyped } from "@/lib/tauri";

export interface NodeMetrics {
  name: string;
  cpu_usage: string | null;
  memory_usage: string | null;
}

export function useNodeMetrics(
  options?: Omit<UseQueryOptions<NodeMetrics[]>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["node-metrics"],
    queryFn: async () => {
      return invokeTyped<NodeMetrics[]>("get_nodes_metrics", {});
    },
    refetchInterval: 8000, // 8 seconds for real-time updates
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    ...options,
  });
}

