// Hook for fetching cluster metrics with real-time updates

import {
  useQuery,
  keepPreviousData,
  UseQueryOptions,
} from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import { ClusterMetrics } from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";

export type { ClusterMetrics } from "@/generated/types";

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
