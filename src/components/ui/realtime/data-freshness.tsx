/**
 * DataFreshness Component
 *
 * Displays a real-time indicator of how old the fetched data is.
 * Shows a colored dot and time label with tooltip.
 *
 * @module components/ui/realtime/data-freshness
 */

import { memo } from "react";
import { useDataFreshness, type FreshnessColor } from "@/hooks/useDataFreshness";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";

export interface DataFreshnessProps {
  /** Timestamp when data was last fetched (from React Query's dataUpdatedAt) */
  dataUpdatedAt: number | undefined;
  /** Whether data is currently being fetched */
  isFetching?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show the label text (default: true) */
  showLabel?: boolean;
}

const DOT_COLORS: Record<FreshnessColor, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  gray: "bg-muted-foreground/50",
};

/**
 * Data freshness indicator component
 *
 * @example
 * ```tsx
 * const { dataUpdatedAt, isFetching } = useQuery(...);
 * <DataFreshness dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} />
 * // Renders: ● 3s with green dot
 * ```
 */
export const DataFreshness = memo(function DataFreshness({
  dataUpdatedAt,
  isFetching = false,
  className,
  showLabel = true,
}: DataFreshnessProps) {
  const { label, color, tooltip } = useDataFreshness(dataUpdatedAt, isFetching);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
              className
            )}
          >
            {isFetching ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <span
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  DOT_COLORS[color]
                )}
              />
            )}
            {showLabel && (
              <span className="tabular-nums">{label}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
