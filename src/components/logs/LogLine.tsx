import { memo } from "react";
import type { LogLine as LogLineType } from "@/generated/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ViewMode,
  HIDDEN_FIELD_KEYS,
  LEVEL_LABELS,
  LEVEL_COLORS,
  LEVEL_BORDER_COLORS,
  FORMAT_DESCRIPTIONS,
  formatTimestamp,
} from "./types";

interface LogLineProps {
  log: LogLineType;
  viewMode: ViewMode;
  searchQuery: string;
  onFieldClick?: (key: string, value: string) => void;
  onLevelClick?: (level: string) => void;
}

export const LogLineComponent = memo(function LogLineComponent({
  log,
  viewMode,
  searchQuery,
  onFieldClick,
  onLevelClick,
}: LogLineProps) {
  const level = log.level ?? "unknown";
  const levelLabel = LEVEL_LABELS[level];
  const levelColor = LEVEL_COLORS[level];
  const borderColor = LEVEL_BORDER_COLORS[level];

  if (viewMode === "raw") {
    return (
      <div className="py-0.5 px-1 hover:bg-muted/50 rounded">
        <span className="whitespace-pre-wrap break-all">
          {searchQuery ? (
            <HighlightedText text={log.raw} query={searchQuery} />
          ) : (
            log.raw
          )}
        </span>
      </div>
    );
  }

  const visibleFields = log.fields
    ? Object.entries(log.fields).filter(([key]) => !HIDDEN_FIELD_KEYS.has(key))
    : [];

  if (viewMode === "table") {
    return (
      <div
        className={`flex gap-3 hover:bg-muted/50 py-0.5 px-1 rounded border-l-2 pl-2 ${borderColor}`}
      >
        <span className="text-muted-foreground shrink-0 w-20">
          {formatTimestamp(log.timestamp)}
        </span>
        <span
          className={`shrink-0 w-8 text-[10px] font-semibold tracking-wide uppercase cursor-pointer hover:underline ${levelColor}`}
          onClick={() => onLevelClick?.(level)}
        >
          {levelLabel}
        </span>
        <div className="flex-1 min-w-0">
          <span className="whitespace-pre-wrap break-all">
            {searchQuery ? (
              <HighlightedText text={log.message} query={searchQuery} />
            ) : (
              log.message
            )}
          </span>
        </div>
        {visibleFields.length > 0 && (
          <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground shrink-0 max-w-xs">
            {visibleFields.slice(0, 3).map(([key, value]) => (
              <span
                key={key}
                className="flex items-baseline gap-1 cursor-pointer hover:text-foreground"
                onClick={() => onFieldClick?.(key, value)}
              >
                <span className="text-foreground/70">{key}</span>
                <span className="truncate max-w-[100px]">{value}</span>
              </span>
            ))}
            {visibleFields.length > 3 && (
              <span className="text-muted-foreground">
                +{visibleFields.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Compact mode (default)
  return (
    <div
      className={`flex gap-3 hover:bg-muted/50 py-0.5 px-1 rounded border-l-2 pl-2 ${borderColor}`}
    >
      <span className="text-muted-foreground shrink-0 w-20">
        {formatTimestamp(log.timestamp)}
      </span>
      <span
        className={`shrink-0 w-8 text-[10px] font-semibold tracking-wide uppercase cursor-pointer hover:underline ${levelColor}`}
        onClick={() => onLevelClick?.(level)}
      >
        {levelLabel}
      </span>
      {log.format !== "plain" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0 text-[10px] uppercase text-muted-foreground cursor-help">
              {log.format}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {FORMAT_DESCRIPTIONS[log.format]}
          </TooltipContent>
        </Tooltip>
      )}
      <div className="flex flex-col gap-1 w-full min-w-0">
        <span className="whitespace-pre-wrap break-all">
          {searchQuery ? (
            <HighlightedText text={log.message} query={searchQuery} />
          ) : (
            log.message
          )}
        </span>
        {visibleFields.length > 0 && (
          <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            {visibleFields.map(([key, value]) => (
              <span
                key={key}
                className="flex items-baseline gap-1 cursor-pointer hover:text-foreground"
                onClick={() => onFieldClick?.(key, value)}
              >
                <span className="text-foreground/70">{key}</span>
                <span className="break-all">{value}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  try {
    const parts = text.split(new RegExp(`(${escapeRegex(query)})`, "gi"));

    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark
              key={i}
              className="bg-yellow-500/30 text-foreground rounded px-0.5"
            >
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  } catch {
    return <>{text}</>;
  }
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
