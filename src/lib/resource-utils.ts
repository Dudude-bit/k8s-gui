/**
 * Resource utilities - Re-exports from k8s-quantity.ts for backward compatibility
 * 
 * This file is kept for compatibility. New code should import from '@/lib/k8s-quantity' directly.
 */

// Re-export all utilities from k8s-quantity
export {
  // Parsing functions
  parseCPU as parseKubernetesCPU,
  parseMemory as parseKubernetesMemory,
  parseQuantity,
  
  // Formatting functions
  formatCPU,
  formatMemory,
  formatBytes,
  formatKubernetesBytes,
  formatResourceUsage,
  
  // Calculation utilities
  calculateUtilization as calculateUtilizationPercentage,
  getUtilizationColor,
  
  // Aggregation utilities
  aggregatePodMetrics,
  getTopPodsByCPU,
  getTopPodsByMemory,
  mergeResourceWithMetrics,
  
  // Constants
  BINARY_UNITS,
  DECIMAL_UNITS,
  CPU_UNITS,
} from './k8s-quantity';
