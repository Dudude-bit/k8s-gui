/**
 * Node Metrics Hook
 *
 * Fetches CPU and memory metrics for Kubernetes nodes with real-time updates.
 * Automatically refreshes every 8 seconds.
 *
 * @module hooks/useNodeMetrics
 */

import {
  useQuery,
  keepPreviousData,
  UseQueryOptions,
} from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";
import type { NodeMetrics } from "@/generated/types";

/**
 * Hook for fetching node metrics
 *
 * @param options - Additional React Query options
 * @returns Query result with array of node metrics
 * @example
 * ```tsx
 * const { data: metrics, isLoading } = useNodeMetrics();
 *
 * metrics?.forEach(node => {
 *   console.log(`${node.name}: ${node.cpuUsage}`);
 * });
 * ```
 */
export function useNodeMetrics(
  options?: Omit<UseQueryOptions<NodeMetrics[]>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["node-metrics"],
    queryFn: async () => {
      try {
        return await commands.getNodesMetrics();
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    refetchInterval: 8000, // 8 seconds for real-time updates
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    ...options,
  });
}
