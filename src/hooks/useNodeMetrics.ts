import {
  useQuery,
  keepPreviousData,
  UseQueryOptions,
} from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import { handlePremiumQueryError } from "@/lib/error-utils";
import type { NodeMetrics } from "@/generated/types";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";

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
  const { hasAccess } = usePremiumFeature();
  const enabled = (options?.enabled ?? true) && hasAccess;

  return useQuery({
    queryKey: ["node-metrics"],
    queryFn: async () => {
      try {
        return await commands.getNodesMetrics();
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
