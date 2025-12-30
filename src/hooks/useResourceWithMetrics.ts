import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useClusterStore } from "@/stores/clusterStore";
import { usePodsWithMetrics } from "@/hooks/usePodsWithMetrics";
import { aggregatePodMetrics } from "@/lib/k8s-quantity";
import type { PodInfo } from "@/generated/types";

export interface ResourceWithMetrics {
  cpuUsage: string | null;
  memoryUsage: string | null;
}

export interface UseResourceWithMetricsOptions {
  /** Whether the query should be enabled */
  enabled?: boolean;
  /** Stale time in milliseconds (default: 10000) */
  staleTime?: number;
  /** Refetch interval in milliseconds (default: 15000) */
  refetchInterval?: number;
}

/**
 * Generic hook for fetching resources with aggregated pod metrics.
 * Uses the centralized usePodsWithMetrics hook to avoid duplicate pod queries.
 *
 * @param resourceQueryKey - Query key for the resource (e.g., ["statefulsets", namespace])
 * @param resourceQueryFn - Function to fetch resources
 * @param podMatchFn - Function to determine if a pod belongs to a resource
 * @param options - Additional query options
 */
export function useResourceWithMetrics<
  T extends { name: string; namespace: string },
>(
  resourceQueryKey: string[],
  resourceQueryFn: () => Promise<T[]>,
  podMatchFn: (resource: T, pod: PodInfo) => boolean,
  options?: UseResourceWithMetricsOptions
) {
  const { isConnected } = useClusterStore();
  const enabled = isConnected && options?.enabled !== false;

  // Fetch main resource data
  const {
    data: resources = [],
    isLoading,
    isFetching,
    refetch,
    ...resourceQuery
  } = useQuery({
    queryKey: resourceQueryKey,
    queryFn: resourceQueryFn,
    enabled,
    placeholderData: keepPreviousData,
    staleTime: options?.staleTime ?? 10000,
    refetchInterval: options?.refetchInterval ?? 15000,
    refetchOnWindowFocus: false,
  });

  // Use centralized pods with metrics hook - this shares cache with other components
  const { data: podsWithMetrics } = usePodsWithMetrics({ enabled });

  // Calculate aggregated metrics per resource
  const resourcesWithMetrics = useMemo(() => {
    return resources.map((resource) => {
      // Find pods belonging to this resource using the provided match function
      const matchedPods = podsWithMetrics.filter((pod) =>
        podMatchFn(resource, pod)
      );

      // Aggregate metrics from matched pods
      const aggregated = aggregatePodMetrics(matchedPods);

      return {
        ...resource,
        cpuUsage: aggregated.cpuUsage,
        memoryUsage: aggregated.memoryUsage,
      };
    });
  }, [resources, podsWithMetrics, podMatchFn]);

  return {
    data: resourcesWithMetrics as (T & ResourceWithMetrics)[],
    resources,
    isLoading,
    isFetching,
    refetch,
    ...resourceQuery,
  };
}

// Common pod matching functions for different resource types

/**
 * Match pods for StatefulSets (pod name pattern: {statefulset-name}-{ordinal})
 */
export function matchStatefulSetPods<
  T extends { name: string; namespace: string },
>(resource: T, pod: PodInfo): boolean {
  return (
    pod.namespace === resource.namespace &&
    pod.name.startsWith(resource.name + "-")
  );
}

/**
 * Match pods for DaemonSets (pod name pattern: {daemonset-name}-{hash})
 */
export function matchDaemonSetPods<
  T extends { name: string; namespace: string },
>(resource: T, pod: PodInfo): boolean {
  return (
    pod.namespace === resource.namespace &&
    pod.name.startsWith(resource.name + "-")
  );
}

/**
 * Match pods for Jobs (pod name pattern: {job-name}-{hash})
 */
export function matchJobPods<T extends { name: string; namespace: string }>(
  resource: T,
  pod: PodInfo
): boolean {
  return (
    pod.namespace === resource.namespace &&
    pod.name.startsWith(resource.name + "-")
  );
}

/**
 * Match pods for Deployments (via labels or name prefix)
 */
export function matchDeploymentPods<
  T extends {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
  },
>(resource: T, pod: PodInfo): boolean {
  const podLabels = pod.labels || {};
  const deploymentLabels = resource.labels || {};

  return (
    pod.namespace === resource.namespace &&
    (podLabels["app"] === deploymentLabels["app"] ||
      podLabels["deployment"] === resource.name ||
      pod.name.startsWith(resource.name + "-"))
  );
}
