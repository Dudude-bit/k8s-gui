/**
 * LiveIndicator - Visual indicator for real-time data updates
 *
 * Shows a pulsing dot with "LIVE" text when watch is active.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface LiveIndicatorProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether the watch is currently active */
  isActive: boolean;
  /** Show text label (default: true) */
  showLabel?: boolean;
  /** Size variant */
  size?: "sm" | "md";
}

/**
 * LiveIndicator component - shows when real-time updates are active
 *
 * @example
 * // Basic usage
 * <LiveIndicator isActive={isWatching} />
 *
 * // Without label
 * <LiveIndicator isActive={isWatching} showLabel={false} />
 *
 * // Small size
 * <LiveIndicator isActive={isWatching} size="sm" />
 */
export function LiveIndicator({
  isActive,
  showLabel = true,
  size = "md",
  className,
  ...props
}: LiveIndicatorProps) {
  if (!isActive) {
    return null;
  }

  const sizeStyles = {
    sm: {
      container: "gap-1 px-1.5 py-0.5",
      dot: "h-1.5 w-1.5",
      text: "text-[10px]",
    },
    md: {
      container: "gap-1.5 px-2 py-0.5",
      dot: "h-2 w-2",
      text: "text-xs",
    },
  };

  const styles = sizeStyles[size];

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full",
        "bg-green-100 dark:bg-green-900/30",
        styles.container,
        className
      )}
      {...props}
    >
      {/* Pulsing dot */}
      <span className="relative flex">
        <span
          className={cn(
            "absolute inline-flex rounded-full bg-green-500 opacity-75 animate-ping",
            styles.dot
          )}
        />
        <span
          className={cn("relative inline-flex rounded-full bg-green-500", styles.dot)}
        />
      </span>

      {/* Label */}
      {showLabel && (
        <span
          className={cn(
            "font-semibold uppercase tracking-wider text-green-700 dark:text-green-400",
            styles.text
          )}
        >
          Live
        </span>
      )}
    </div>
  );
}
