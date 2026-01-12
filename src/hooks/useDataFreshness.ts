/**
 * Data Freshness Hook
 *
 * Provides real-time tracking of how old the fetched data is.
 * Useful for showing users when data was last updated.
 *
 * @module hooks/useDataFreshness
 */

import { useSyncExternalStore, useMemo, useCallback } from "react";
import { tickStore } from "@/stores/tickStore";

export type FreshnessColor = "green" | "yellow" | "gray";

export interface DataFreshnessResult {
  /** Seconds since data was fetched */
  seconds: number;
  /** Formatted label (e.g., "3s", "15s", "1m") */
  label: string;
  /** Color indicator based on freshness */
  color: FreshnessColor;
  /** Full description for tooltip */
  tooltip: string;
}

/**
 * Format seconds into a compact label
 */
function formatFreshnessLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

/**
 * Determine color based on freshness
 * - green: < 5 seconds (fresh)
 * - yellow: 5-15 seconds (slightly stale)
 * - gray: > 15 seconds (waiting for update)
 */
function getFreshnessColor(seconds: number): FreshnessColor {
  if (seconds < 5) return "green";
  if (seconds <= 15) return "yellow";
  return "gray";
}

/**
 * Hook for tracking data freshness with real-time updates
 *
 * @param dataUpdatedAt - Timestamp when data was last fetched (from React Query)
 * @returns Freshness information including seconds, label, color, and tooltip
 *
 * @example
 * ```tsx
 * const { data, dataUpdatedAt } = useQuery(...);
 * const freshness = useDataFreshness(dataUpdatedAt);
 * return <DataFreshnessBadge {...freshness} />;
 * ```
 */
export function useDataFreshness(
  dataUpdatedAt: number | undefined
): DataFreshnessResult {
  // Always use fast channel for freshness indicator
  const subscribe = useCallback(
    (callback: () => void) => tickStore.subscribe("fast", callback),
    []
  );

  const getSnapshot = useCallback(() => tickStore.getSnapshot("fast"), []);

  const getServerSnapshot = useCallback(
    () => tickStore.getServerSnapshot("fast"),
    []
  );

  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (!dataUpdatedAt) {
      return {
        seconds: 0,
        label: "-",
        color: "gray" as FreshnessColor,
        tooltip: "No data loaded",
      };
    }

    const seconds = Math.floor((Date.now() - dataUpdatedAt) / 1000);
    const label = formatFreshnessLabel(seconds);
    const color = getFreshnessColor(seconds);
    const tooltip = `Last updated ${seconds} second${seconds !== 1 ? "s" : ""} ago`;

    return { seconds, label, color, tooltip };
  }, [dataUpdatedAt]);
}
