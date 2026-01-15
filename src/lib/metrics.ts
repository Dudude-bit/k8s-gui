import type { PodMetrics, NodeMetrics, PodInfo, NodeInfo } from "@/generated/types";
import { parseCPU, parseMemory } from './k8s-quantity';

export interface PodWithMetrics extends PodInfo {
  cpuMillicores: number | null;
  memoryBytes: number | null;
}

export interface PodWithMetricsAndResources extends PodWithMetrics {
  aggregatedResources: AggregatedResources;
}

export interface NodeWithMetrics extends NodeInfo {
  cpuMillicores: number | null;
  memoryBytes: number | null;
}

export interface ResourceMetrics {
  cpuMillicores: number | null;
  memoryBytes: number | null;
}

export function mergePodsWithMetrics(
  pods: PodInfo[],
  metrics: PodMetrics[]
): PodWithMetrics[] {
  const metricsByKey = new Map<string, PodMetrics>();
  for (const metric of metrics) {
    metricsByKey.set(`${metric.namespace}/${metric.name}`, metric);
  }

  return pods.map((pod) => {
    const metric = metricsByKey.get(`${pod.namespace}/${pod.name}`);
    return {
      ...pod,
      cpuMillicores: metric?.cpuMillicores ?? null,
      memoryBytes: metric?.memoryBytes ?? null,
    };
  });
}

/**
 * Merge pods with metrics AND parse resource specs
 */
export function mergePodsWithMetricsAndResources(
  pods: PodInfo[],
  metrics: PodMetrics[]
): PodWithMetricsAndResources[] {
  const withMetrics = mergePodsWithMetrics(pods, metrics);

  return withMetrics.map((pod) => ({
    ...pod,
    aggregatedResources: aggregatePodResources(pod),
  }));
}

export function mergeNodesWithMetrics(
  nodes: NodeInfo[],
  metrics: NodeMetrics[]
): NodeWithMetrics[] {
  const metricsByName = new Map<string, NodeMetrics>();
  for (const metric of metrics) {
    metricsByName.set(metric.name, metric);
  }

  return nodes.map((node) => {
    const metric = metricsByName.get(node.name);
    return {
      ...node,
      cpuMillicores: metric?.cpuMillicores ?? null,
      memoryBytes: metric?.memoryBytes ?? null,
    };
  });
}

export function aggregatePodMetrics(
  metrics: Array<{ cpuMillicores?: number | null; memoryBytes?: number | null }>
): ResourceMetrics {
  let totalCpu = 0;
  let totalMemory = 0;
  let hasCpu = false;
  let hasMemory = false;

  for (const metric of metrics) {
    if (metric.cpuMillicores !== null && metric.cpuMillicores !== undefined) {
      hasCpu = true;
      totalCpu += metric.cpuMillicores;
    }
    if (metric.memoryBytes !== null && metric.memoryBytes !== undefined) {
      hasMemory = true;
      totalMemory += metric.memoryBytes;
    }
  }

  return {
    cpuMillicores: hasCpu ? totalCpu : null,
    memoryBytes: hasMemory ? totalMemory : null,
  };
}

export function attachAggregatedPodMetrics<
  T extends { name: string; namespace: string },
>(
  resources: T[],
  pods: PodWithMetrics[],
  matchFn: (resource: T, pod: PodInfo) => boolean
): Array<T & ResourceMetrics> {
  return resources.map((resource) => {
    const matchedPods = pods.filter((pod) => matchFn(resource, pod));
    const aggregated = aggregatePodMetrics(matchedPods);
    return {
      ...resource,
      cpuMillicores: aggregated.cpuMillicores,
      memoryBytes: aggregated.memoryBytes,
    };
  });
}

export function getTopPodsByCPU(
  pods: Array<{
    name: string;
    namespace?: string | null;
    cpuMillicores?: number | null;
  }>,
  limit: number = 5
): Array<{ name: string; namespace: string; cpuMillicores: number }> {
  return pods
    .filter(
      (pod) => pod.cpuMillicores !== null && pod.cpuMillicores !== undefined
    )
    .map((pod) => ({
      name: pod.name,
      namespace: pod.namespace ?? "default",
      cpuMillicores: pod.cpuMillicores as number,
    }))
    .sort((a, b) => b.cpuMillicores - a.cpuMillicores)
    .slice(0, limit);
}

export function getTopPodsByMemory(
  pods: Array<{
    name: string;
    namespace?: string | null;
    memoryBytes?: number | null;
  }>,
  limit: number = 5
): Array<{ name: string; namespace: string; memoryBytes: number }> {
  return pods
    .filter(
      (pod) => pod.memoryBytes !== null && pod.memoryBytes !== undefined
    )
    .map((pod) => ({
      name: pod.name,
      namespace: pod.namespace ?? "default",
      memoryBytes: pod.memoryBytes as number,
    }))
    .sort((a, b) => b.memoryBytes - a.memoryBytes)
    .slice(0, limit);
}

function matchPodNamePrefix<
  T extends { name: string; namespace: string },
>(resource: T, pod: PodInfo): boolean {
  return (
    pod.namespace === resource.namespace &&
    pod.name.startsWith(resource.name + "-")
  );
}

export function matchStatefulSetPods<
  T extends { name: string; namespace: string },
>(resource: T, pod: PodInfo): boolean {
  return matchPodNamePrefix(resource, pod);
}

export function matchDaemonSetPods<
  T extends { name: string; namespace: string },
>(resource: T, pod: PodInfo): boolean {
  return matchPodNamePrefix(resource, pod);
}

export function matchJobPods<T extends { name: string; namespace: string }>(
  resource: T,
  pod: PodInfo
): boolean {
  return matchPodNamePrefix(resource, pod);
}

export function matchCronJobPods<T extends { name: string; namespace: string }>(
  cronJob: T,
  pod: PodInfo
): boolean {
  return matchPodNamePrefix(cronJob, pod);
}

export function matchDeploymentPods<
  T extends { name: string; namespace: string; labels?: Record<string, string> },
>(deployment: T, pod: PodInfo): boolean {
  if (pod.namespace !== deployment.namespace) {
    return false;
  }

  const podLabels = pod.labels ?? {};
  const deploymentLabels = deployment.labels ?? {};

  return (
    podLabels.app === deploymentLabels.app ||
    podLabels.deployment === deployment.name ||
    matchPodNamePrefix(deployment, pod)
  );
}

/**
 * Aggregated resource values in parsed form
 */
export interface AggregatedResources {
  cpuRequest: number | null;
  cpuLimit: number | null;
  memoryRequest: number | null;
  memoryLimit: number | null;
}

/**
 * Aggregate resource requests and limits from a pod
 *
 * @param pod - Pod with cpuRequests, cpuLimits, memoryRequests, memoryLimits
 * @returns Parsed resource values
 */
export function aggregatePodResources(pod: {
  cpuRequests?: string | null;
  cpuLimits?: string | null;
  memoryRequests?: string | null;
  memoryLimits?: string | null;
}): AggregatedResources {
  return {
    cpuRequest: pod.cpuRequests ? parseCPU(pod.cpuRequests) : null,
    cpuLimit: pod.cpuLimits ? parseCPU(pod.cpuLimits) : null,
    memoryRequest: pod.memoryRequests ? parseMemory(pod.memoryRequests) : null,
    memoryLimit: pod.memoryLimits ? parseMemory(pod.memoryLimits) : null,
  };
}

/**
 * Aggregate resources across multiple pods
 *
 * @param pods - Array of pods with resource specs
 * @returns Summed resource values
 */
export function aggregateMultiplePodResources(
  pods: Array<{
    cpuRequests?: string | null;
    cpuLimits?: string | null;
    memoryRequests?: string | null;
    memoryLimits?: string | null;
  }>
): AggregatedResources {
  let cpuRequest = 0;
  let cpuLimit = 0;
  let memoryRequest = 0;
  let memoryLimit = 0;
  let hasCpuRequest = false;
  let hasCpuLimit = false;
  let hasMemoryRequest = false;
  let hasMemoryLimit = false;

  for (const pod of pods) {
    if (pod.cpuRequests) {
      hasCpuRequest = true;
      cpuRequest += parseCPU(pod.cpuRequests);
    }
    if (pod.cpuLimits) {
      hasCpuLimit = true;
      cpuLimit += parseCPU(pod.cpuLimits);
    }
    if (pod.memoryRequests) {
      hasMemoryRequest = true;
      memoryRequest += parseMemory(pod.memoryRequests);
    }
    if (pod.memoryLimits) {
      hasMemoryLimit = true;
      memoryLimit += parseMemory(pod.memoryLimits);
    }
  }

  return {
    cpuRequest: hasCpuRequest ? cpuRequest : null,
    cpuLimit: hasCpuLimit ? cpuLimit : null,
    memoryRequest: hasMemoryRequest ? memoryRequest : null,
    memoryLimit: hasMemoryLimit ? memoryLimit : null,
  };
}
