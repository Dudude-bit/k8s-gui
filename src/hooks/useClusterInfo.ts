/**
 * Hook for fetching cluster information
 *
 * Provides cluster info including Kubernetes version, platform, etc.
 * Data is cached and shared across components using the same query key.
 *
 * @module hooks/useClusterInfo
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { commands } from "@/lib/commands";
import { useClusterStore } from "@/stores/clusterStore";
import { normalizeTauriError } from "@/lib/error-utils";
import { REFRESH_INTERVALS, STALE_TIMES } from "@/lib/refresh";

export function useClusterInfo() {
  const { isConnected, currentContext } = useClusterStore();

  return useQuery({
    queryKey: ["cluster-info", currentContext],
    queryFn: async () => {
      if (!currentContext) return null;
      try {
        return await commands.getClusterInfo(currentContext);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: isConnected && !!currentContext,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIMES.overview,
    refetchInterval: REFRESH_INTERVALS.overview,
    refetchOnWindowFocus: false,
  });
}
