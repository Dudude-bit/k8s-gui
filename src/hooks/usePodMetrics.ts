/**
 * Pod Metrics Hook
 *
 * Fetches CPU and memory metrics for pods with real-time updates.
 * Automatically refreshes every 8 seconds.
 *
 * @module hooks/usePodMetrics
 */

import {
  useQuery,
  keepPreviousData,
  UseQueryOptions,
} from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import { PodMetrics } from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";

export type { PodMetrics } from "@/generated/types";

/**
 * Hook for fetching pod metrics
 *
 * @param namespace - Namespace to filter pods (null for all namespaces)
 * @param options - Additional React Query options
 * @returns Query result with array of pod metrics
 * @example
 * ```tsx
 * const { data: metrics } = usePodMetrics("default");
 *
 * metrics?.forEach(pod => {
 *   console.log(`${pod.name}: ${pod.cpuUsage}`);
 * });
 * ```
 */
export function usePodMetrics(
  namespace: string | null | undefined,
  options?: Omit<UseQueryOptions<PodMetrics[]>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["pod-metrics", namespace],
    queryFn: async () => {
      try {
        return await commands.getPodsMetrics(namespace ?? null);
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
