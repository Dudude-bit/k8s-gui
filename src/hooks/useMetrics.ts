import {
  useQuery,
  keepPreviousData,
  UseQueryOptions,
} from "@tanstack/react-query";
import { commands } from "@/lib/commands";
import type {
  MetricsStatus,
  PodMetricsResponse,
  NodeMetricsResponse,
  ClusterMetricsResponse,
} from "@/generated/types";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { handlePremiumQueryError } from "@/lib/error-utils";
import { REFRESH_INTERVALS, STALE_TIMES } from "@/lib/refresh";
import { queryKeys } from "@/lib/query-keys";

export interface UseMetricsOptions {
  namespace?: string | null;
  enabled?: boolean;
  includePods?: boolean;
  includeNodes?: boolean;
  includeCluster?: boolean;
  podQueryOptions?: Omit<
    UseQueryOptions<PodMetricsResponse>,
    "queryKey" | "queryFn"
  >;
  nodeQueryOptions?: Omit<
    UseQueryOptions<NodeMetricsResponse>,
    "queryKey" | "queryFn"
  >;
  clusterQueryOptions?: Omit<
    UseQueryOptions<ClusterMetricsResponse>,
    "queryKey" | "queryFn"
  >;
}

const EMPTY_STATUS: MetricsStatus = {
  status: "error",
  message: null,
};

const EMPTY_POD_METRICS: PodMetricsResponse = {
  status: EMPTY_STATUS,
  data: [],
};

const EMPTY_NODE_METRICS: NodeMetricsResponse = {
  status: EMPTY_STATUS,
  data: [],
};

const EMPTY_CLUSTER_METRICS: ClusterMetricsResponse = {
  status: EMPTY_STATUS,
  data: {
    totalCpuMillicores: null,
    totalMemoryBytes: null,
    totalCpuCapacityMillicores: null,
    totalMemoryCapacityBytes: null,
  },
};

export function useMetrics(options?: UseMetricsOptions) {
  const { hasAccess } = usePremiumFeature();
  const enabled = (options?.enabled ?? true) && hasAccess;
  const includePods = options?.includePods ?? true;
  const includeNodes = options?.includeNodes ?? true;
  const includeCluster = options?.includeCluster ?? true;

  const podMetricsQuery = useQuery({
    queryKey: queryKeys.metrics.pods(options?.namespace),
    queryFn: async () => {
      try {
        return await commands.getPodsMetrics(options?.namespace ?? null);
      } catch (err) {
        return handlePremiumQueryError(err, EMPTY_POD_METRICS);
      }
    },
    enabled: enabled && includePods,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIMES.metrics,
    refetchInterval: REFRESH_INTERVALS.metrics,
    refetchOnWindowFocus: false,
    ...options?.podQueryOptions,
  });

  const nodeMetricsQuery = useQuery({
    queryKey: queryKeys.metrics.nodes(),
    queryFn: async () => {
      try {
        return await commands.getNodesMetrics();
      } catch (err) {
        return handlePremiumQueryError(err, EMPTY_NODE_METRICS);
      }
    },
    enabled: enabled && includeNodes,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIMES.metrics,
    refetchInterval: REFRESH_INTERVALS.metrics,
    refetchOnWindowFocus: false,
    ...options?.nodeQueryOptions,
  });

  const clusterMetricsQuery = useQuery({
    queryKey: queryKeys.metrics.cluster(),
    queryFn: async () => {
      try {
        return await commands.getClusterMetrics();
      } catch (err) {
        return handlePremiumQueryError(err, EMPTY_CLUSTER_METRICS);
      }
    },
    enabled: enabled && includeCluster,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIMES.metrics,
    refetchInterval: REFRESH_INTERVALS.metricsCluster,
    refetchOnWindowFocus: false,
    ...options?.clusterQueryOptions,
  });

  return {
    podMetrics: podMetricsQuery.data?.data ?? [],
    podStatus: podMetricsQuery.data?.status ?? null,
    nodeMetrics: nodeMetricsQuery.data?.data ?? [],
    nodeStatus: nodeMetricsQuery.data?.status ?? null,
    clusterMetrics: clusterMetricsQuery.data?.data ?? null,
    clusterStatus: clusterMetricsQuery.data?.status ?? null,
    podMetricsQuery,
    nodeMetricsQuery,
    clusterMetricsQuery,
    // Combined loading states for easier consumption
    isLoading:
      podMetricsQuery.isLoading ||
      nodeMetricsQuery.isLoading ||
      clusterMetricsQuery.isLoading,
    isFetching:
      podMetricsQuery.isFetching ||
      nodeMetricsQuery.isFetching ||
      clusterMetricsQuery.isFetching,
    isError:
      podMetricsQuery.isError ||
      nodeMetricsQuery.isError ||
      clusterMetricsQuery.isError,
  };
}
