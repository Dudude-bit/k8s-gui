import type { LogFormat, LogLevel, LogLine } from "@/generated/types";

export type ViewMode = "compact" | "table" | "raw";

export interface LogFilter {
  search: string;
  levels: LogLevel[];
  fields: Record<string, string>;
}

export interface ActiveFilter {
  type: "level" | "field" | "search";
  key?: string;
  value: string;
  label: string;
}

export const HIDDEN_FIELD_KEYS = new Set([
  "message",
  "msg",
  "log",
  "event",
  "level",
  "lvl",
  "severity",
]);

export const LEVEL_LABELS: Record<LogLevel, string> = {
  fatal: "FTL",
  error: "ERR",
  warn: "WRN",
  info: "INF",
  debug: "DBG",
  unknown: "---",
};

export const LEVEL_COLORS: Record<LogLevel, string> = {
  fatal: "text-red-700",
  error: "text-red-500",
  warn: "text-amber-500",
  info: "text-sky-500",
  debug: "text-purple-500",
  unknown: "text-muted-foreground",
};

export const LEVEL_BORDER_COLORS: Record<LogLevel, string> = {
  fatal: "border-red-700",
  error: "border-red-500",
  warn: "border-amber-500",
  info: "border-sky-500",
  debug: "border-purple-500",
  unknown: "border-transparent",
};

export const FORMAT_DESCRIPTIONS: Record<LogFormat, string> = {
  json: "Structured JSON log format with parsed fields",
  logfmt: "Key=value pairs format (e.g., level=info msg=\"hello\")",
  klog: "Kubernetes log format with severity prefix (I/W/E/F)",
  logback: "Java Logback format with timestamp and level",
  plain: "Plain text without structured formatting",
};

export function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return "--:--:--";
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  } catch {
    return timestamp;
  }
}

export { LogFormat, LogLevel, LogLine };
