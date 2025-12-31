import {
  useQuery,
  keepPreviousData,
  UseQueryOptions,
} from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import { PodMetrics } from "@/generated/types";
import { handlePremiumQueryError } from "@/lib/error-utils";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";

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
  const { hasAccess } = usePremiumFeature();
  const enabled = (options?.enabled ?? true) && hasAccess;

  return useQuery({
    queryKey: ["pod-metrics", namespace],
    queryFn: async () => {
      try {
        return await commands.getPodsMetrics(namespace ?? null);
      } catch (err) {
        // Metrics are a premium feature - return empty array if not licensed
        return handlePremiumQueryError(err, []);
      }
    },
    refetchInterval: 8000, // 8 seconds for real-time updates
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    ...options,
    enabled,
  });
}
