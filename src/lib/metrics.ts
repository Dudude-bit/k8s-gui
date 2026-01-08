import type { PodMetrics, NodeMetrics, PodInfo, NodeInfo } from "@/generated/types";

export interface PodWithMetrics extends PodInfo {
  cpuMillicores: number | null;
  memoryBytes: number | null;
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
