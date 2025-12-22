import { useQuery, keepPreviousData, UseQueryOptions } from "@tanstack/react-query";
import { useClusterStore } from "@/stores/clusterStore";

/**
 * Custom hook for resource queries with standardized defaults
 */
export function useResourceQuery<TData = unknown, TError = Error>(
  queryKey: string[],
  queryFn: () => Promise<TData>,
  options?: Partial<UseQueryOptions<TData, TError>>,
) {
  const isConnected = useClusterStore((state) => state.isConnected);

  return useQuery({
    queryKey,
    queryFn,
    enabled: isConnected && (options?.enabled !== false),
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    ...options,
  });
}

