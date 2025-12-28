/**
 * Kubernetes Quantity Parsing and Formatting
 * 
 * Unified module for parsing and formatting Kubernetes resource quantities.
 * Supports both CPU (cores/millicores) and Memory (bytes/Ki/Mi/Gi) formats.
 */

// Binary unit multipliers (Ki, Mi, Gi, Ti, Pi, Ei)
export const BINARY_UNITS: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
};

// Decimal unit multipliers (K, M, G, T, P, E)
export const DECIMAL_UNITS: Record<string, number> = {
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
};

// CPU-specific units
export const CPU_UNITS: Record<string, number> = {
  n: 1e-9,  // nanocores
  u: 1e-6,  // microcores
  m: 1e-3,  // millicores
};

/**
 * Parse a generic Kubernetes quantity string to a number
 * Handles both CPU and memory formats
 * 
 * @param value - The quantity string (e.g., "500m", "1Gi", "2")
 * @returns Parsed number or null if invalid
 */
export function parseQuantity(value: string | null | undefined): number | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Match number with optional unit suffix
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)([a-zA-Z]*)$/);
  if (!match) return null;

  const amount = parseFloat(match[1]);
  if (isNaN(amount)) return null;

  const unit = match[2];
  if (!unit) return amount;

  // Check CPU units first (m, n, u)
  if (unit in CPU_UNITS) {
    return amount * CPU_UNITS[unit];
  }

  // Check binary units (Ki, Mi, Gi, etc.)
  if (unit in BINARY_UNITS) {
    return amount * BINARY_UNITS[unit];
  }

  // Check decimal units (K, M, G, etc.)
  if (unit in DECIMAL_UNITS) {
    return amount * DECIMAL_UNITS[unit];
  }

  return null;
}

/**
 * Parse CPU quantity to cores (number)
 * Supports formats: "500m", "0.5", "2", "2.5", "100n"
 * 
 * @param cpuStr - CPU string value
 * @returns CPU in cores (e.g., 0.5 for "500m")
 */
export function parseCPU(cpuStr: string | null | undefined): number {
  if (!cpuStr) return 0;

  const trimmed = cpuStr.trim();

  // Nanocores: "100000000n" -> 0.1 cores
  if (trimmed.endsWith('n')) {
    const nanocores = parseFloat(trimmed.slice(0, -1));
    return isNaN(nanocores) ? 0 : nanocores / 1e9;
  }

  // Millicores: "500m" -> 0.5 cores
  if (trimmed.endsWith('m')) {
    const millicores = parseFloat(trimmed.slice(0, -1));
    return isNaN(millicores) ? 0 : millicores / 1000;
  }

  // Cores: "2", "0.5", "2.5"
  const cores = parseFloat(trimmed);
  return isNaN(cores) ? 0 : cores;
}

/**
 * Parse memory quantity to bytes (number)
 * Supports formats: "512Mi", "1Gi", "1024Ki", "1073741824", "100M", "1G"
 * 
 * @param memStr - Memory string value
 * @returns Memory in bytes
 */
export function parseMemory(memStr: string | null | undefined): number {
  if (!memStr) return 0;

  const trimmed = memStr.trim();

  // Binary units (Ki, Mi, Gi, Ti)
  if (trimmed.endsWith('Ki')) {
    const num = parseFloat(trimmed.slice(0, -2));
    return isNaN(num) ? 0 : num * BINARY_UNITS.Ki;
  }

  if (trimmed.endsWith('Mi')) {
    const num = parseFloat(trimmed.slice(0, -2));
    return isNaN(num) ? 0 : num * BINARY_UNITS.Mi;
  }

  if (trimmed.endsWith('Gi')) {
    const num = parseFloat(trimmed.slice(0, -2));
    return isNaN(num) ? 0 : num * BINARY_UNITS.Gi;
  }

  if (trimmed.endsWith('Ti')) {
    const num = parseFloat(trimmed.slice(0, -2));
    return isNaN(num) ? 0 : num * BINARY_UNITS.Ti;
  }

  // Decimal units (K, M, G, T) - single character
  if (trimmed.endsWith('K') && !trimmed.endsWith('Ki')) {
    const num = parseFloat(trimmed.slice(0, -1));
    return isNaN(num) ? 0 : num * DECIMAL_UNITS.K;
  }

  if (trimmed.endsWith('M') && !trimmed.endsWith('Mi')) {
    const num = parseFloat(trimmed.slice(0, -1));
    return isNaN(num) ? 0 : num * DECIMAL_UNITS.M;
  }

  if (trimmed.endsWith('G') && !trimmed.endsWith('Gi')) {
    const num = parseFloat(trimmed.slice(0, -1));
    return isNaN(num) ? 0 : num * DECIMAL_UNITS.G;
  }

  if (trimmed.endsWith('T') && !trimmed.endsWith('Ti')) {
    const num = parseFloat(trimmed.slice(0, -1));
    return isNaN(num) ? 0 : num * DECIMAL_UNITS.T;
  }

  // Assume bytes if no unit
  const bytes = parseFloat(trimmed);
  return isNaN(bytes) ? 0 : bytes;
}

/**
 * Format CPU from cores to string representation
 * Returns format like "500m" for < 1 core, or "2" for >= 1 core
 * 
 * @param cores - CPU in cores
 * @returns Formatted CPU string
 */
export function formatCPU(cores: number): string {
  if (cores === 0) return '0';

  if (cores < 1) {
    const millicores = Math.round(cores * 1000);
    return `${millicores}m`;
  }

  if (cores % 1 === 0) {
    return `${cores}`;
  }

  return cores.toFixed(2);
}

/**
 * Format memory from bytes to human-readable string
 * Returns format like "512Mi", "1Gi", etc.
 * 
 * @param bytes - Memory in bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted memory string
 */
export function formatMemory(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0';

  const tib = bytes / BINARY_UNITS.Ti;
  if (tib >= 1) return `${tib.toFixed(decimals)}Ti`;

  const gib = bytes / BINARY_UNITS.Gi;
  if (gib >= 1) return `${gib.toFixed(decimals)}Gi`;

  const mib = bytes / BINARY_UNITS.Mi;
  if (mib >= 1) return `${mib.toFixed(decimals)}Mi`;

  const kib = bytes / BINARY_UNITS.Ki;
  if (kib >= 1) return `${kib.toFixed(decimals)}Ki`;

  return `${bytes}B`;
}

/**
 * Format bytes to human-readable string (generic)
 * 
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));

  return `${value} ${sizes[i]}`;
}

/**
 * Format Kubernetes bytes string to human-readable format
 * 
 * @param value - Kubernetes quantity string
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string or "-" if invalid
 */
export function formatKubernetesBytes(
  value: string | null | undefined,
  decimals: number = 1
): string {
  if (!value) return "-";

  const bytes = parseQuantity(value);
  if (bytes === null || isNaN(bytes)) return value;

  return formatBytes(bytes, decimals);
}

/**
 * Calculate utilization percentage
 * 
 * @param used - Used amount
 * @param total - Total/limit amount
 * @returns Percentage (0-100) or null if invalid
 */
export function calculateUtilization(used: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

/**
 * Get color variant based on utilization percentage
 * 
 * @param percentage - Utilization percentage
 * @returns Color variant name
 */
export function getUtilizationColor(
  percentage: number | null
): 'default' | 'secondary' | 'destructive' {
  if (percentage === null) return 'default';
  if (percentage >= 90) return 'destructive';
  if (percentage >= 70) return 'secondary';
  return 'default';
}

/**
 * Format resource usage with percentage
 * Format: "500m / 2 (25%)" for CPU, "512Mi / 4Gi (12.5%)" for Memory
 * 
 * @param used - Used amount string
 * @param total - Total/limit amount string
 * @param type - Resource type ('cpu' or 'memory')
 * @returns Formatted usage string
 */
export function formatResourceUsage(
  used: string | null | undefined,
  total: string | null | undefined,
  type: 'cpu' | 'memory'
): string {
  if (!used && !total) return '-';

  const usedNum = type === 'cpu' ? parseCPU(used) : parseMemory(used);
  const totalNum = type === 'cpu' ? parseCPU(total) : parseMemory(total);

  const usedFormatted = used
    ? (type === 'cpu' ? used : formatMemory(usedNum))
    : '-';
  const totalFormatted = total
    ? (type === 'cpu' ? total : formatMemory(totalNum))
    : '-';

  const percentage = calculateUtilization(usedNum, totalNum);
  const percentageStr = percentage !== null ? ` (${percentage.toFixed(1)}%)` : '';

  return `${usedFormatted} / ${totalFormatted}${percentageStr}`;
}

/**
 * Aggregate pod metrics (sum CPU and memory)
 * 
 * @param metrics - Array of metrics objects
 * @returns Aggregated CPU and memory usage
 */
export function aggregatePodMetrics(
  metrics: Array<{ cpuUsage?: string | null; memoryUsage?: string | null }>
): { cpuUsage: string | null; memoryUsage: string | null } {
  let totalCpuCores = 0;
  let totalMemoryBytes = 0;

  for (const metric of metrics) {
    const cpu = metric.cpuUsage;
    if (cpu) {
      totalCpuCores += parseCPU(cpu);
    }
    const memory = metric.memoryUsage;
    if (memory) {
      totalMemoryBytes += parseMemory(memory);
    }
  }

  return {
    cpuUsage: totalCpuCores > 0 ? formatCPU(totalCpuCores) : null,
    memoryUsage: totalMemoryBytes > 0 ? formatMemory(totalMemoryBytes) : null,
  };
}

/**
 * Get top pods by CPU usage
 * 
 * @param pods - Array of pods with cpuUsage
 * @param limit - Maximum number of results
 * @returns Sorted array of top CPU consumers
 */
export function getTopPodsByCPU(
  pods: Array<{ name: string; cpuUsage?: string | null }>,
  limit: number = 5
): Array<{ name: string; cpuUsage: number }> {
  return pods
    .map(pod => ({
      name: pod.name,
      cpuUsage: parseCPU(pod.cpuUsage),
    }))
    .sort((a, b) => b.cpuUsage - a.cpuUsage)
    .slice(0, limit);
}

/**
 * Get top pods by memory usage
 * 
 * @param pods - Array of pods with memoryUsage
 * @param limit - Maximum number of results
 * @returns Sorted array of top memory consumers
 */
export function getTopPodsByMemory(
  pods: Array<{ name: string; memoryUsage?: string | null }>,
  limit: number = 5
): Array<{ name: string; memoryUsage: number }> {
  return pods
    .map(pod => ({
      name: pod.name,
      memoryUsage: parseMemory(pod.memoryUsage),
    }))
    .sort((a, b) => b.memoryUsage - a.memoryUsage)
    .slice(0, limit);
}

/**
 * Merge resource with its metrics
 * 
 * @param resources - Array of resources
 * @param metrics - Array of metrics
 * @param matchFn - Function to match resource with metric
 * @returns Resources merged with metrics
 */
export function mergeResourceWithMetrics<T extends { name: string; namespace: string }>(
  resources: T[],
  metrics: Array<{ name: string; namespace: string; cpuUsage: string | null; memoryUsage: string | null }>,
  matchFn: (resource: T, metric: { name: string; namespace: string }) => boolean = (r, m) =>
    r.name === m.name && r.namespace === m.namespace
): (T & { cpuUsage: string | null; memoryUsage: string | null })[] {
  return resources.map((resource) => {
    const metric = metrics.find((m) => matchFn(resource, m));
    return {
      ...resource,
      cpuUsage: metric?.cpuUsage ?? null,
      memoryUsage: metric?.memoryUsage ?? null,
    };
  });
}

