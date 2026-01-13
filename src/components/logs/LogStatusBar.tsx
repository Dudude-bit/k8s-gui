import { useMemo } from "react";
import type { LogLine } from "@/generated/types";

interface LogStatusBarProps {
  logs: LogLine[];
  filteredCount: number;
  isStreaming: boolean;
  searchQuery: string;
}

export function LogStatusBar({
  logs,
  filteredCount,
  isStreaming,
  searchQuery,
}: LogStatusBarProps) {
  const detectedFormat = useMemo(() => {
    if (logs.length === 0) return null;

    const formatCounts = new Map<string, number>();
    for (const log of logs) {
      const format = log.format ?? "plain";
      formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1);
    }

    if (formatCounts.size === 1) {
      return formatCounts.keys().next().value ?? null;
    }

    // Find dominant format
    let maxFormat = "mixed";
    let maxCount = 0;
    for (const [format, count] of formatCounts) {
      if (count > maxCount) {
        maxCount = count;
        maxFormat = format;
      }
    }

    const percentage = Math.round((maxCount / logs.length) * 100);
    if (percentage >= 90) {
      return `${maxFormat} (${percentage}%)`;
    }

    return "mixed";
  }, [logs]);

  return (
    <div className="flex items-center justify-between px-4 py-1 text-xs text-muted-foreground border-t bg-muted/30">
      <span>
        {filteredCount} {filteredCount === 1 ? "line" : "lines"}
        {searchQuery && logs.length !== filteredCount && (
          <span> (filtered from {logs.length})</span>
        )}
      </span>
      <div className="flex items-center gap-4">
        {detectedFormat && (
          <span className="capitalize">format: {detectedFormat}</span>
        )}
        {isStreaming && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Streaming
          </span>
        )}
      </div>
    </div>
  );
}
