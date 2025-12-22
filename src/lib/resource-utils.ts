// Utilities for formatting and calculating Kubernetes resource usage

/**
 * Parse CPU quantity to millicores (number)
 * Supports formats: "500m", "0.5", "2", "2.5"
 */
export function parseKubernetesCPU(cpuStr: string | null | undefined): number {
  if (!cpuStr) return 0;
  
  const trimmed = cpuStr.trim();
  
  if (trimmed.endsWith('m')) {
    // Millicores: "500m" -> 500 millicores -> 0.5 cores
    const numStr = trimmed.slice(0, -1);
    const millicores = parseFloat(numStr);
    return isNaN(millicores) ? 0 : millicores / 1000;
  }
  
  // Cores: "2", "0.5", "2.5"
  const cores = parseFloat(trimmed);
  return isNaN(cores) ? 0 : cores;
}

/**
 * Parse memory quantity to bytes (number)
 * Supports formats: "512Mi", "1Gi", "1024Ki", "1073741824"
 */
export function parseKubernetesMemory(memStr: string | null | undefined): number {
  if (!memStr) return 0;
  
  const trimmed = memStr.trim();
  
  if (trimmed.endsWith('Ki')) {
    const numStr = trimmed.slice(0, -2);
    const kib = parseFloat(numStr);
    return isNaN(kib) ? 0 : kib * 1024;
  }
  
  if (trimmed.endsWith('Mi')) {
    const numStr = trimmed.slice(0, -2);
    const mib = parseFloat(numStr);
    return isNaN(mib) ? 0 : mib * 1024 * 1024;
  }
  
  if (trimmed.endsWith('Gi')) {
    const numStr = trimmed.slice(0, -2);
    const gib = parseFloat(numStr);
    return isNaN(gib) ? 0 : gib * 1024 * 1024 * 1024;
  }
  
  if (trimmed.endsWith('Ti')) {
    const numStr = trimmed.slice(0, -2);
    const tib = parseFloat(numStr);
    return isNaN(tib) ? 0 : tib * 1024 * 1024 * 1024 * 1024;
  }
  
  if (trimmed.endsWith('K')) {
    const numStr = trimmed.slice(0, -1);
    const kb = parseFloat(numStr);
    return isNaN(kb) ? 0 : kb * 1000;
  }
  
  if (trimmed.endsWith('M')) {
    const numStr = trimmed.slice(0, -1);
    const mb = parseFloat(numStr);
    return isNaN(mb) ? 0 : mb * 1000 * 1000;
  }
  
  if (trimmed.endsWith('G')) {
    const numStr = trimmed.slice(0, -1);
    const gb = parseFloat(numStr);
    return isNaN(gb) ? 0 : gb * 1000 * 1000 * 1000;
  }
  
  // Assume bytes
  const bytes = parseFloat(trimmed);
  return isNaN(bytes) ? 0 : bytes;
}

/**
 * Format CPU from cores to string representation
 * Returns format like "500m" for < 1 core, or "2" for >= 1 core
 */
export function formatCPU(cores: number): string {
  if (cores < 1) {
    return `${Math.round(cores * 1000)}m`;
  }
  if (cores % 1 === 0) {
    return `${cores}`;
  }
  return cores.toFixed(2);
}

/**
 * Format memory from bytes to human-readable string
 * Returns format like "512Mi", "1Gi", etc.
 */
export function formatMemory(bytes: number): string {
  if (bytes === 0) return '0';
  
  const kib = bytes / 1024;
  const mib = kib / 1024;
  const gib = mib / 1024;
  const tib = gib / 1024;
  
  if (tib >= 1) {
    return `${tib.toFixed(2)}Ti`;
  }
  if (gib >= 1) {
    return `${gib.toFixed(2)}Gi`;
  }
  if (mib >= 1) {
    return `${mib.toFixed(2)}Mi`;
  }
  if (kib >= 1) {
    return `${kib.toFixed(2)}Ki`;
  }
  return `${bytes}B`;
}

/**
 * Calculate utilization percentage
 * Returns percentage as number (0 to 100)
 */
export function calculateUtilizationPercentage(
  used: number,
  total: number
): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

/**
 * Format resource usage string
 * Format: "500m / 2 (25%)" for CPU, "512Mi / 4Gi (12.5%)" for Memory
 */
export function formatResourceUsage(
  used: string | null | undefined,
  total: string | null | undefined,
  type: 'cpu' | 'memory'
): string {
  if (!used && !total) return '-';
  
  const usedNum = type === 'cpu' 
    ? parseKubernetesCPU(used)
    : parseKubernetesMemory(used);
  const totalNum = type === 'cpu'
    ? parseKubernetesCPU(total)
    : parseKubernetesMemory(total);
  
  const usedFormatted = used 
    ? (type === 'cpu' ? used : formatMemory(usedNum))
    : '-';
  const totalFormatted = total
    ? (type === 'cpu' ? total : formatMemory(totalNum))
    : '-';
  
  const percentage = calculateUtilizationPercentage(usedNum, totalNum);
  const percentageStr = percentage !== null ? ` (${percentage.toFixed(1)}%)` : '';
  
  return `${usedFormatted} / ${totalFormatted}${percentageStr}`;
}

/**
 * Get color variant for utilization percentage
 * Returns: 'default' (< 70%), 'secondary' (70-90%), 'destructive' (> 90%)
 */
export function getUtilizationColor(percentage: number | null): 'default' | 'secondary' | 'destructive' {
  if (percentage === null) return 'default';
  if (percentage >= 90) return 'destructive';
  if (percentage >= 70) return 'secondary';
  return 'default';
}

/**
 * Aggregate pod metrics (sum CPU and memory)
 */
export function aggregatePodMetrics(
  metrics: Array<{ cpu_usage?: string | null; memory_usage?: string | null }>
): { cpu_usage: string | null; memory_usage: string | null } {
  let totalCpuCores = 0;
  let totalMemoryBytes = 0;
  
  for (const metric of metrics) {
    if (metric.cpu_usage) {
      totalCpuCores += parseKubernetesCPU(metric.cpu_usage);
    }
    if (metric.memory_usage) {
      totalMemoryBytes += parseKubernetesMemory(metric.memory_usage);
    }
  }
  
  return {
    cpu_usage: totalCpuCores > 0 ? formatCPU(totalCpuCores) : null,
    memory_usage: totalMemoryBytes > 0 ? formatMemory(totalMemoryBytes) : null,
  };
}

/**
 * Get top pods by CPU usage
 */
export function getTopPodsByCPU(
  pods: Array<{ name: string; cpu_usage?: string | null }>,
  limit: number = 5
): Array<{ name: string; cpu_usage: number }> {
  return pods
    .map(pod => ({
      name: pod.name,
      cpu_usage: parseKubernetesCPU(pod.cpu_usage),
    }))
    .sort((a, b) => b.cpu_usage - a.cpu_usage)
    .slice(0, limit);
}

/**
 * Get top pods by memory usage
 */
export function getTopPodsByMemory(
  pods: Array<{ name: string; memory_usage?: string | null }>,
  limit: number = 5
): Array<{ name: string; memory_usage: number }> {
  return pods
    .map(pod => ({
      name: pod.name,
      memory_usage: parseKubernetesMemory(pod.memory_usage),
    }))
    .sort((a, b) => b.memory_usage - a.memory_usage)
    .slice(0, limit);
}

