// Hook for fetching pod metrics with real-time updates

import {
  useQuery,
  keepPreviousData,
  UseQueryOptions,
} from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import { PodMetrics } from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";

export type { PodMetrics } from "@/generated/types";

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
