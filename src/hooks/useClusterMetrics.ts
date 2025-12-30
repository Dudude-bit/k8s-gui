/**
 * Cluster Metrics Hook
 *
 * Fetches aggregated cluster-wide CPU and memory metrics with real-time updates.
 * Automatically refreshes every 10 seconds.
 *
 * @module hooks/useClusterMetrics
 */

import {
  useQuery,
  keepPreviousData,
  UseQueryOptions,
} from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import { ClusterMetrics } from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";

export type { ClusterMetrics } from "@/generated/types";

/**
 * Hook for fetching cluster-wide metrics
 *
 * @param options - Additional React Query options
 * @returns Query result with cluster metrics data
 * @example
 * ```tsx
 * const { data: metrics, isLoading } = useClusterMetrics();
 *
 * if (metrics) {
 *   console.log(`CPU: ${metrics.totalCpuUsage}`);
 * }
 * ```
 */
export function useClusterMetrics(
  options?: Omit<UseQueryOptions<ClusterMetrics>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["cluster-metrics"],
    queryFn: async () => {
      try {
        return await commands.getClusterMetrics();
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    refetchInterval: 10000, // 10 seconds for real-time updates
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    ...options,
  });
}
