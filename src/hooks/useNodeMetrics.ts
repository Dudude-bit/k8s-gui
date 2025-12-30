// Hook for fetching node metrics with real-time updates

import {
  useQuery,
  keepPreviousData,
  UseQueryOptions,
} from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";
import type { NodeMetrics } from "@/generated/types";

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
