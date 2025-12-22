import { keepPreviousData, UseQueryOptions } from "@tanstack/react-query";
import { useResourceQuery } from "./useResourceQuery";

/**
 * Hook for resource list queries with standardized defaults for lists
 * 
 * Defaults:
 * - staleTime: 10000ms
 * - placeholderData: keepPreviousData
 * - refetchOnWindowFocus: false
 */
export function useResourceListQuery<TData = unknown, TError = Error>(
  queryKey: string[],
  queryFn: () => Promise<TData>,
  options?: Partial<UseQueryOptions<TData, TError>>
) {
  return useResourceQuery(queryKey, queryFn, {
    staleTime: 10000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    ...options,
  });
}

