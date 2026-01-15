// src/lib/metrics-utils.ts
/**
 * Metrics calculation utilities
 *
 * Provides smart percentage calculation and type-specific color thresholds.
 * CPU: warning at 80%, critical at 95% (throttling is tolerable)
 * Memory: warning at 70%, critical at 85% (OOMKill is dangerous)
 */

export type MetricType = 'cpu' | 'memory';
export type UtilizationLevel = 'normal' | 'warning' | 'critical';
export type PercentageBase = 'limit' | 'request' | null;

export interface MetricState {
  /** Raw value in base units (millicores for CPU, bytes for memory) */
  value: number;
  /** Formatted display string (e.g., "256Mi", "500m") */
  displayValue: string;
  /** Percentage utilization (0-100) or null if no base available */
  percentage: number | null;
  /** What the percentage is calculated from */
  base: PercentageBase;
  /** Utilization level for color coding */
  level: UtilizationLevel;
  /** Whether a limit is configured */
  hasLimit: boolean;
  /** Whether a request is configured */
  hasRequest: boolean;
}

export interface MetricThresholds {
  warning: number;
  critical: number;
}

/**
 * Thresholds by metric type
 * CPU: Higher thresholds because throttling is tolerable
 * Memory: Lower thresholds because OOMKill is critical
 */
export const METRIC_THRESHOLDS: Record<MetricType, MetricThresholds> = {
  cpu: { warning: 80, critical: 95 },
  memory: { warning: 70, critical: 85 },
};

/**
 * Get thresholds for a metric type
 */
export function getThresholds(type: MetricType): MetricThresholds {
  return METRIC_THRESHOLDS[type];
}

/**
 * Calculate utilization level based on percentage and metric type
 */
export function getUtilizationLevel(
  percentage: number | null,
  type: MetricType
): UtilizationLevel {
  if (percentage === null) return 'normal';

  const thresholds = getThresholds(type);

  if (percentage >= thresholds.critical) return 'critical';
  if (percentage >= thresholds.warning) return 'warning';
  return 'normal';
}

/**
 * Calculate percentage with smart base selection
 * Priority: limit > request > null
 */
export function calculatePercentage(
  usage: number,
  request: number | null,
  limit: number | null
): { percentage: number | null; base: PercentageBase } {
  if (limit !== null && limit > 0) {
    return {
      percentage: Math.min(100, Math.max(0, (usage / limit) * 100)),
      base: 'limit',
    };
  }

  if (request !== null && request > 0) {
    return {
      percentage: Math.min(999, Math.max(0, (usage / request) * 100)),
      base: 'request',
    };
  }

  return { percentage: null, base: null };
}
