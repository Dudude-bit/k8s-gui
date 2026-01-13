# Log Viewer Redesign - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor log viewer with stricter format detection and Loki-style UI

**Architecture:** Backend (Rust) parses logs with improved detection rules. Frontend splits into modular components with three view modes (Compact/Table/Raw) and clickable field filters.

**Tech Stack:** Rust (kube-rs, serde_json), React (TypeScript), Tauri events

---

## Task 1: Stricter JSON Detection

**Files:**
- Modify: `src-tauri/src/logs/mod.rs:446-478`

**Step 1: Write failing test for structured JSON detection**

Add to the `#[cfg(test)]` section at the end of `mod.rs`:

```rust
#[test]
fn test_json_detection_requires_log_fields() {
    // Valid structured log - should detect as JSON
    let valid = r#"{"msg":"hello","level":"info"}"#;
    let (format, _, _, _) = LogStreamer::parse_structured_message(valid);
    assert_eq!(format, LogFormat::Json);

    // Arbitrary JSON without log fields - should NOT detect as JSON
    let arbitrary = r#"{"foo":"bar","count":42}"#;
    let (format, _, _, _) = LogStreamer::parse_structured_message(arbitrary);
    assert_eq!(format, LogFormat::Plain);
}
```

**Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test test_json_detection_requires_log_fields -- --nocapture`

Expected: FAIL - arbitrary JSON is detected as JSON format

**Step 3: Implement stricter JSON detection**

Replace the `parse_json_message` function in `mod.rs`:

```rust
fn parse_json_message(
    message: &str,
) -> Option<(BTreeMap<String, String>, Option<LogLevel>, Option<String>)> {
    let trimmed = message.trim_start();
    if !trimmed.starts_with('{') {
        return None;
    }

    let value: Value = serde_json::from_str(trimmed).ok()?;
    let object = value.as_object()?;

    // NEW: Require at least one common log field to consider this structured JSON
    let has_log_fields = object.contains_key("msg")
        || object.contains_key("message")
        || object.contains_key("level")
        || object.contains_key("lvl")
        || object.contains_key("severity")
        || object.contains_key("time")
        || object.contains_key("ts")
        || object.contains_key("timestamp")
        || object.contains_key("@timestamp")
        || object.contains_key("log");

    if !has_log_fields {
        return None;
    }

    let mut fields = BTreeMap::new();
    for (key, value) in object {
        let entry = match value {
            Value::String(inner) => inner.clone(),
            _ => value.to_string(),
        };
        fields.insert(key.clone(), entry);
    }

    let level_value = Self::extract_json_value(
        object,
        &["level", "lvl", "severity", "log.level"],
    );
    let message_value = Self::extract_json_value(
        object,
        &["msg", "message", "log", "event", "error"],
    );

    let level = level_value.as_deref().and_then(LogLevel::parse_value);

    Some((fields, level, message_value))
}
```

**Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test test_json_detection_requires_log_fields -- --nocapture`

Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/logs/mod.rs
git commit -m "fix(logs): require log fields for JSON format detection

Arbitrary JSON objects without msg/level/time fields are no longer
detected as structured JSON logs. This prevents false positives."
```

---

## Task 2: Stricter logfmt Detection

**Files:**
- Modify: `src-tauri/src/logs/mod.rs:495-504`, `598-668`

**Step 1: Write failing test for logfmt detection**

Add to `#[cfg(test)]`:

```rust
#[test]
fn test_logfmt_detection_requires_multiple_pairs() {
    // Valid logfmt - multiple key=value pairs
    let valid = "level=info msg=\"user logged in\" user=john";
    let (format, _, _, _) = LogStreamer::parse_structured_message(valid);
    assert_eq!(format, LogFormat::Logfmt);

    // Single key=value in sentence - should NOT detect as logfmt
    let sentence = "Starting server port=8080";
    let (format, _, _, _) = LogStreamer::parse_structured_message(sentence);
    assert_eq!(format, LogFormat::Plain);

    // Plain text with equals sign - should NOT detect
    let plain = "Error: x=5 is invalid";
    let (format, _, _, _) = LogStreamer::parse_structured_message(plain);
    assert_eq!(format, LogFormat::Plain);
}
```

**Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test test_logfmt_detection_requires_multiple_pairs -- --nocapture`

Expected: FAIL

**Step 3: Implement stricter logfmt detection**

Replace `parse_logfmt_message` function:

```rust
fn parse_logfmt_message(
    message: &str,
) -> Option<(BTreeMap<String, String>, Option<LogLevel>, Option<String>)> {
    let fields = Self::parse_logfmt_fields(message)?;

    // NEW: Require at least 2 valid key=value pairs
    if fields.len() < 2 {
        return None;
    }

    // NEW: All keys must be valid identifiers (alphanumeric + underscore)
    let all_valid_keys = fields.keys().all(|k| {
        !k.is_empty() && k.chars().all(|c| c.is_alphanumeric() || c == '_')
    });
    if !all_valid_keys {
        return None;
    }

    let level_value = Self::extract_logfmt_value(&fields, &["level", "lvl", "severity"]);
    let message_value =
        Self::extract_logfmt_value(&fields, &["msg", "message", "log", "event", "error"]);
    let level = level_value.as_deref().and_then(LogLevel::parse_value);
    Some((fields, level, message_value))
}
```

**Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test test_logfmt_detection_requires_multiple_pairs -- --nocapture`

Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/logs/mod.rs
git commit -m "fix(logs): require 2+ valid pairs for logfmt detection

Single key=value in text no longer triggers logfmt format.
Keys must be valid identifiers (alphanumeric/underscore)."
```

---

## Task 3: Remove Aggressive Level Detection for Plain Text

**Files:**
- Modify: `src-tauri/src/logs/mod.rs:194-212`, `383-384`

**Step 1: Write failing test**

Add to `#[cfg(test)]`:

```rust
#[test]
fn test_plain_text_level_is_unknown() {
    // Plain text mentioning "error" should NOT be marked as Error level
    let line = "Processing error handler registration";
    let log = LogStreamer::parse_log_line(line, "pod", "container", "ns");
    assert_eq!(log.format, LogFormat::Plain);
    assert_eq!(log.level, Some(LogLevel::Unknown));

    // Plain text with "warning" in content
    let line2 = "This is a warning about disk space";
    let log2 = LogStreamer::parse_log_line(line2, "pod", "container", "ns");
    assert_eq!(log2.level, Some(LogLevel::Unknown));
}
```

**Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test test_plain_text_level_is_unknown -- --nocapture`

Expected: FAIL - currently returns Error/Warn level

**Step 3: Modify parse_structured_message to not guess level for plain text**

In `parse_structured_message`, change the final return:

```rust
fn parse_structured_message(
    message: &str,
) -> (
    LogFormat,
    Option<BTreeMap<String, String>>,
    String,
    Option<LogLevel>,
) {
    if let Some((fields, level, msg)) = Self::parse_json_message(message) {
        return (
            LogFormat::Json,
            Some(fields),
            msg.unwrap_or_else(|| message.to_string()),
            level,
        );
    }

    if let Some((fields, level, msg)) = Self::parse_logfmt_message(message) {
        return (
            LogFormat::Logfmt,
            Some(fields),
            msg.unwrap_or_else(|| message.to_string()),
            level,
        );
    }

    if let Some((msg, level)) = Self::parse_klog_message(message) {
        return (
            LogFormat::Klog,
            None,
            msg.unwrap_or_else(|| message.to_string()),
            Some(level),
        );
    }

    if let Some((msg, level)) = Self::parse_logback_message(message) {
        return (
            LogFormat::Logback,
            None,
            msg.unwrap_or_else(|| message.to_string()),
            Some(level),
        );
    }

    // CHANGED: Return Unknown instead of guessing from text
    (LogFormat::Plain, None, message.to_string(), Some(LogLevel::Unknown))
}
```

Also update `parse_log_line` to not call `LogLevel::parse`:

```rust
fn parse_log_line(line: &str, pod: &str, container: &str, namespace: &str) -> LogLine {
    let raw = line.to_string();
    let (timestamp, message) = if line.len() > 30 {
        if let Some(space_idx) = line.find(' ') {
            let potential_ts = &line[..space_idx];
            if let Ok(ts) = DateTime::parse_from_rfc3339(potential_ts) {
                (
                    Some(ts.with_timezone(&Utc)),
                    line[space_idx + 1..].to_string(),
                )
            } else {
                (None, line.to_string())
            }
        } else {
            (None, line.to_string())
        }
    } else {
        (None, line.to_string())
    };

    let (format, fields, message, level) = Self::parse_structured_message(&message);
    // REMOVED: let level = level_override.unwrap_or_else(|| LogLevel::parse(&message));

    LogLine {
        timestamp,
        message,
        level,  // Now directly from parse_structured_message
        format,
        fields,
        raw,
        pod: pod.to_string(),
        container: container.to_string(),
        namespace: namespace.to_string(),
    }
}
```

**Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test test_plain_text_level_is_unknown -- --nocapture`

Expected: PASS

**Step 5: Run all log tests**

Run: `cd src-tauri && cargo test logs:: -- --nocapture`

Expected: All tests pass

**Step 6: Commit**

```bash
git add src-tauri/src/logs/mod.rs
git commit -m "fix(logs): don't guess log level from plain text content

Plain text logs now always have Unknown level. Level is only
detected from structured formats (JSON fields, klog prefix, etc.)."
```

---

## Task 4: Create useLogStream Hook

**Files:**
- Create: `src/components/logs/hooks/useLogStream.ts`
- Modify: `src/components/logs/LogViewer.tsx`

**Step 1: Create hooks directory**

Run: `mkdir -p src/components/logs/hooks`

**Step 2: Create useLogStream.ts**

```typescript
import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { commands } from "@/lib/commands";
import type { LogFormat, LogLevel, LogLine, StreamLogConfig } from "@/generated/types";
import { normalizeTauriError, isPremiumFeatureError } from "@/lib/error-utils";

const MAX_LOG_LINES = 5000;

interface UseLogStreamOptions {
  podName: string;
  namespace: string;
  container: string;
  tailLines: number;
  onPodNotFound?: () => void;
}

interface UseLogStreamResult {
  logs: LogLine[];
  isStreaming: boolean;
  isConnecting: boolean;
  error: string | null;
  isPaused: boolean;
  clearLogs: () => void;
  togglePause: () => void;
  retry: () => void;
}

export function useLogStream({
  podName,
  namespace,
  container,
  tailLines,
  onPodNotFound,
}: UseLogStreamOptions): UseLogStreamResult {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const streamIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setIsPaused(false);
    setRetryTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let active = true;
    let currentStreamId: string | null = null;
    let currentUnlisten: (() => void) | null = null;

    const cleanup = async () => {
      active = false;
      if (currentUnlisten) {
        currentUnlisten();
        currentUnlisten = null;
      }
      if (currentStreamId) {
        try {
          await commands.stopLogStream(currentStreamId);
        } catch (err) {
          console.error("Failed to stop log streaming:", err);
        }
        currentStreamId = null;
      }
      setIsStreaming(false);
      setIsConnecting(false);
    };

    const initStream = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!active || isPaused) return;

      try {
        setIsConnecting(true);
        setError(null);
        setLogs([]);

        const config: StreamLogConfig = {
          podName,
          namespace,
          container,
          tailLines,
          follow: true,
          timestamps: true,
          previous: false,
          sinceSeconds: null,
        };

        if (!active) {
          setIsConnecting(false);
          return;
        }

        const streamId = await commands.streamPodLogs(config);

        if (!active) {
          commands.stopLogStream(streamId).catch(console.error);
          setIsConnecting(false);
          return;
        }

        currentStreamId = streamId;
        streamIdRef.current = streamId;

        const unlisten = await listen<{
          stream_id: string;
          line: string;
          pod: string;
          container: string;
          message: string;
          timestamp: string | null;
          level: LogLevel | null;
          format: LogFormat | null;
          fields: Record<string, string> | null;
          raw: string;
        }>("log-line", (event) => {
          if (event.payload.stream_id === streamId) {
            setLogs((prev) =>
              [
                ...prev,
                {
                  timestamp: event.payload.timestamp,
                  message: event.payload.message,
                  level: event.payload.level,
                  format: event.payload.format ?? "plain",
                  fields: event.payload.fields,
                  raw: event.payload.raw || event.payload.line || event.payload.message,
                  pod: event.payload.pod,
                  container: event.payload.container,
                  namespace,
                },
              ].slice(-MAX_LOG_LINES)
            );
          }
        });

        if (!active) {
          unlisten();
          commands.stopLogStream(streamId).catch(console.error);
          setIsConnecting(false);
          return;
        }

        currentUnlisten = unlisten;
        unlistenRef.current = unlisten;

        setIsStreaming(true);
        setIsConnecting(false);
      } catch (err) {
        if (!active) return;

        console.error("Failed to start log streaming:", err);
        const errorMsg = normalizeTauriError(err);

        if (isPremiumFeatureError(errorMsg)) {
          setError(
            "Log streaming is a premium feature. Please activate your license to use real-time log streaming."
          );
        } else {
          const isPodNotFoundError =
            errorMsg.includes("not found") || errorMsg.includes("NotFound");

          setError(errorMsg);

          if (isPodNotFoundError && onPodNotFound) {
            onPodNotFound();
          }
        }
        setIsConnecting(false);
        setIsStreaming(false);
      }
    };

    initStream();

    return () => {
      cleanup();
    };
  }, [container, tailLines, podName, namespace, isPaused, retryTrigger, onPodNotFound]);

  return {
    logs,
    isStreaming,
    isConnecting,
    error,
    isPaused,
    clearLogs,
    togglePause,
    retry,
  };
}
```

**Step 3: Verify TypeScript compilation**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui && npx tsc --noEmit`

Expected: No errors

**Step 4: Commit**

```bash
git add src/components/logs/hooks/useLogStream.ts
git commit -m "refactor(logs): extract useLogStream hook

Moves streaming logic out of LogViewer component.
Handles connection lifecycle, pause/resume, retry."
```

---

## Task 5: Create Log Types

**Files:**
- Create: `src/components/logs/types.ts`

**Step 1: Create types file**

```typescript
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
```

**Step 2: Verify compilation**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui && npx tsc --noEmit`

Expected: No errors

**Step 3: Commit**

```bash
git add src/components/logs/types.ts
git commit -m "refactor(logs): add shared types and constants

Centralizes log-related types, level colors, field filters."
```

---

## Task 6: Create LogLine Component

**Files:**
- Create: `src/components/logs/LogLine.tsx`

**Step 1: Create LogLine.tsx**

```typescript
import { memo } from "react";
import type { LogLine as LogLineType } from "@/generated/types";
import {
  ViewMode,
  HIDDEN_FIELD_KEYS,
  LEVEL_LABELS,
  LEVEL_COLORS,
  LEVEL_BORDER_COLORS,
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
        <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
          {log.format}
        </span>
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
```

**Step 2: Verify compilation**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui && npx tsc --noEmit`

Expected: No errors

**Step 3: Commit**

```bash
git add src/components/logs/LogLine.tsx
git commit -m "refactor(logs): add LogLine component

Renders single log line in compact/table/raw modes.
Supports clickable fields and level filters."
```

---

## Task 7: Create LogToolbar Component

**Files:**
- Create: `src/components/logs/LogToolbar.tsx`

**Step 1: Create LogToolbar.tsx**

```typescript
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Download,
  Pause,
  Play,
  Search,
  Trash2,
  ArrowDown,
  Rows3,
  AlignJustify,
  Code,
} from "lucide-react";
import type { ViewMode } from "./types";

interface LogToolbarProps {
  containers: string[];
  selectedContainer: string;
  onContainerChange: (container: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  tailLines: number;
  onTailLinesChange: (lines: number) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isStreaming: boolean;
  isConnecting: boolean;
  autoScroll: boolean;
  isAtBottom: boolean;
  onScrollToBottom: () => void;
  onClearLogs: () => void;
  onDownloadLogs: () => void;
  onToggleStreaming: () => void;
}

export function LogToolbar({
  containers,
  selectedContainer,
  onContainerChange,
  searchQuery,
  onSearchChange,
  tailLines,
  onTailLinesChange,
  viewMode,
  onViewModeChange,
  isStreaming,
  isConnecting,
  autoScroll,
  isAtBottom,
  onScrollToBottom,
  onClearLogs,
  onDownloadLogs,
  onToggleStreaming,
}: LogToolbarProps) {
  return (
    <div className="flex items-center gap-2 p-2 border-b bg-muted/50">
      <Select value={selectedContainer} onValueChange={onContainerChange}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Select container" />
        </SelectTrigger>
        <SelectContent>
          {containers.map((container) => (
            <SelectItem key={container} value={container}>
              {container}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search logs..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8"
        />
      </div>

      <Select
        value={tailLines.toString()}
        onValueChange={(v) => onTailLinesChange(parseInt(v))}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="100">100 lines</SelectItem>
          <SelectItem value="500">500 lines</SelectItem>
          <SelectItem value="1000">1000 lines</SelectItem>
          <SelectItem value="5000">5000 lines</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center border rounded-md">
        <Button
          variant={viewMode === "compact" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onViewModeChange("compact")}
          title="Compact view"
          className="rounded-r-none"
        >
          <AlignJustify className="h-4 w-4" />
        </Button>
        <Button
          variant={viewMode === "table" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onViewModeChange("table")}
          title="Table view"
          className="rounded-none border-x"
        >
          <Rows3 className="h-4 w-4" />
        </Button>
        <Button
          variant={viewMode === "raw" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onViewModeChange("raw")}
          title="Raw view"
          className="rounded-l-none"
        >
          <Code className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        <Button
          variant={autoScroll ? "secondary" : "ghost"}
          size="icon"
          onClick={onScrollToBottom}
          title={autoScroll ? "Auto-scroll enabled" : "Scroll to bottom"}
        >
          <ArrowDown
            className={`h-4 w-4 ${!isAtBottom ? "animate-bounce" : ""}`}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClearLogs}
          title="Clear logs"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDownloadLogs}
          title="Download logs"
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          variant={isStreaming ? "destructive" : "default"}
          size="sm"
          onClick={onToggleStreaming}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <>
              <Spinner size="sm" className="mr-1" />
              Connecting
            </>
          ) : isStreaming ? (
            <>
              <Pause className="h-4 w-4 mr-1" />
              Stop
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-1" />
              Stream
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Verify compilation**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui && npx tsc --noEmit`

Expected: No errors

**Step 3: Commit**

```bash
git add src/components/logs/LogToolbar.tsx
git commit -m "refactor(logs): add LogToolbar component

Toolbar with container/search/tail controls and view mode toggle.
Replaces Pretty/Raw buttons with Compact/Table/Raw icons."
```

---

## Task 8: Create LogFilters Component

**Files:**
- Create: `src/components/logs/LogFilters.tsx`

**Step 1: Create LogFilters.tsx**

```typescript
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ActiveFilter } from "./types";

interface LogFiltersProps {
  filters: ActiveFilter[];
  onRemoveFilter: (filter: ActiveFilter) => void;
}

export function LogFilters({ filters, onRemoveFilter }: LogFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-2 py-1 border-b bg-muted/30">
      <span className="text-xs text-muted-foreground">Filters:</span>
      <div className="flex flex-wrap gap-1">
        {filters.map((filter, index) => (
          <Badge
            key={`${filter.type}-${filter.key}-${filter.value}-${index}`}
            variant="secondary"
            className="flex items-center gap-1 cursor-pointer hover:bg-destructive/20"
            onClick={() => onRemoveFilter(filter)}
          >
            <span>{filter.label}</span>
            <X className="h-3 w-3" />
          </Badge>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Verify compilation**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui && npx tsc --noEmit`

Expected: No errors

**Step 3: Commit**

```bash
git add src/components/logs/LogFilters.tsx
git commit -m "refactor(logs): add LogFilters component

Displays active filter chips with remove functionality."
```

---

## Task 9: Create LogStatusBar Component

**Files:**
- Create: `src/components/logs/LogStatusBar.tsx`

**Step 1: Create LogStatusBar.tsx**

```typescript
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
```

**Step 2: Verify compilation**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui && npx tsc --noEmit`

Expected: No errors

**Step 3: Commit**

```bash
git add src/components/logs/LogStatusBar.tsx
git commit -m "refactor(logs): add LogStatusBar component

Shows line count, detected format percentage, streaming status."
```

---

## Task 10: Refactor LogViewer to Use New Components

**Files:**
- Modify: `src/components/logs/LogViewer.tsx`

**Step 1: Rewrite LogViewer.tsx**

```typescript
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { commands } from "@/lib/commands";
import type { LogLine } from "@/generated/types";

import { useLogStream } from "./hooks/useLogStream";
import { LogToolbar } from "./LogToolbar";
import { LogLineComponent } from "./LogLine";
import { LogFilters } from "./LogFilters";
import { LogStatusBar } from "./LogStatusBar";
import type { ViewMode, ActiveFilter } from "./types";

interface LogViewerProps {
  podName: string;
  namespace: string;
  containers: string[];
  initialContainer?: string;
  onPodNotFound?: () => void;
}

export function LogViewer({
  podName,
  namespace,
  containers,
  initialContainer,
  onPodNotFound,
}: LogViewerProps) {
  const { toast } = useToast();
  const [selectedContainer, setSelectedContainer] = useState(
    initialContainer || containers[0]
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [tailLines, setTailLines] = useState(100);
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [autoScroll, setAutoScroll] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const {
    logs,
    isStreaming,
    isConnecting,
    error,
    isPaused,
    clearLogs,
    togglePause,
    retry,
  } = useLogStream({
    podName,
    namespace,
    container: selectedContainer,
    tailLines,
    onPodNotFound,
  });

  // Filter logs based on search and active filters
  const filteredLogs = useMemo(() => {
    let result = logs;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((log) =>
        log.message.toLowerCase().includes(query) ||
        log.raw.toLowerCase().includes(query)
      );
    }

    // Apply active filters
    for (const filter of activeFilters) {
      if (filter.type === "level") {
        result = result.filter((log) => log.level === filter.value);
      } else if (filter.type === "field" && filter.key) {
        result = result.filter(
          (log) => log.fields?.[filter.key!] === filter.value
        );
      }
    }

    return result;
  }, [logs, searchQuery, activeFilters]);

  // Scroll area helpers
  const getViewport = useCallback(() => {
    return scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement | null;
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll) {
      const viewport = getViewport();
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTo({
            top: viewport.scrollHeight,
            behavior: "smooth",
          });
        });
      }
    }
  }, [logs, autoScroll, getViewport]);

  // Track scroll position
  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const atBottom = scrollHeight - scrollTop - clientHeight < 50;
      setIsAtBottom(atBottom);

      if (atBottom && !autoScroll) {
        setAutoScroll(true);
      }
      if (!atBottom && autoScroll) {
        setAutoScroll(false);
      }
    };

    viewport.addEventListener("scroll", handleScroll);
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [autoScroll, getViewport]);

  const scrollToBottom = useCallback(() => {
    const viewport = getViewport();
    if (viewport) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: "smooth",
      });
      setAutoScroll(true);
    }
  }, [getViewport]);

  const handleDownloadLogs = async () => {
    try {
      const allLogs = await commands.getPodLogs(
        podName,
        namespace,
        selectedContainer,
        10000,
        null,
        false
      );

      const content = allLogs
        .map((log) => log.raw || `${log.timestamp || ""} ${log.message}`)
        .join("\n");
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${podName}-${selectedContainer}-logs.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download logs:", err);
      toast({
        title: "Download failed",
        description: "Could not download logs",
        variant: "destructive",
      });
    }
  };

  const handleFieldClick = (key: string, value: string) => {
    const exists = activeFilters.some(
      (f) => f.type === "field" && f.key === key && f.value === value
    );
    if (!exists) {
      setActiveFilters((prev) => [
        ...prev,
        { type: "field", key, value, label: `${key}=${value}` },
      ]);
    }
  };

  const handleLevelClick = (level: string) => {
    const exists = activeFilters.some(
      (f) => f.type === "level" && f.value === level
    );
    if (!exists) {
      setActiveFilters((prev) => [
        ...prev,
        { type: "level", value: level, label: `level=${level}` },
      ]);
    }
  };

  const handleRemoveFilter = (filter: ActiveFilter) => {
    setActiveFilters((prev) =>
      prev.filter(
        (f) =>
          !(f.type === filter.type && f.key === filter.key && f.value === filter.value)
      )
    );
  };

  const handleRetry = () => {
    retry();
  };

  return (
    <div className="flex flex-col h-full">
      <LogToolbar
        containers={containers}
        selectedContainer={selectedContainer}
        onContainerChange={setSelectedContainer}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        tailLines={tailLines}
        onTailLinesChange={setTailLines}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isStreaming={isStreaming}
        isConnecting={isConnecting}
        autoScroll={autoScroll}
        isAtBottom={isAtBottom}
        onScrollToBottom={scrollToBottom}
        onClearLogs={clearLogs}
        onDownloadLogs={handleDownloadLogs}
        onToggleStreaming={togglePause}
      />

      <LogFilters filters={activeFilters} onRemoveFilter={handleRemoveFilter} />

      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        <div
          className="p-4 font-mono text-xs leading-relaxed"
          style={{ minHeight: "100%" }}
        >
          {error ? (
            <div className="text-center py-8">
              <p className="text-destructive mb-2">Failed to stream logs</p>
              <p className="text-muted-foreground text-xs mb-4">{error}</p>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                Retry
              </Button>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {isConnecting
                ? "Connecting to log stream..."
                : isStreaming
                  ? "Waiting for logs..."
                  : 'Click "Stream" to start viewing logs'}
            </div>
          ) : (
            filteredLogs.map((log, index) => (
              <LogLineComponent
                key={index}
                log={log}
                viewMode={viewMode}
                searchQuery={searchQuery}
                onFieldClick={handleFieldClick}
                onLevelClick={handleLevelClick}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <LogStatusBar
        logs={logs}
        filteredCount={filteredLogs.length}
        isStreaming={isStreaming}
        searchQuery={searchQuery}
      />
    </div>
  );
}
```

**Step 2: Verify compilation**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui && npx tsc --noEmit`

Expected: No errors

**Step 3: Verify the app builds**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui && npm run build`

Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/logs/LogViewer.tsx
git commit -m "refactor(logs): rewrite LogViewer with modular components

- Uses useLogStream hook for streaming logic
- LogToolbar with Compact/Table/Raw view modes
- LogFilters for active filter chips
- LogLine with clickable fields and levels
- LogStatusBar with format detection"
```

---

## Task 11: Create Index Export

**Files:**
- Create: `src/components/logs/index.ts`

**Step 1: Create index.ts**

```typescript
export { LogViewer } from "./LogViewer";
export { useLogStream } from "./hooks/useLogStream";
export type { ViewMode, ActiveFilter, LogFilter } from "./types";
```

**Step 2: Commit**

```bash
git add src/components/logs/index.ts
git commit -m "refactor(logs): add index exports"
```

---

## Task 12: Run Full Test Suite

**Step 1: Run Rust tests**

Run: `cd src-tauri && cargo test`

Expected: All tests pass

**Step 2: Run TypeScript build**

Run: `npm run build`

Expected: Build succeeds

**Step 3: Run lint**

Run: `npm run lint`

Expected: No errors (or fix any that appear)

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address lint issues from refactoring"
```

---

## Task 13: Manual Testing Checklist

Test the following scenarios manually:

- [ ] Open pod logs - stream connects
- [ ] Switch between Compact/Table/Raw views
- [ ] Search filters logs correctly
- [ ] Click on a field → filter added
- [ ] Click on level badge → filter added
- [ ] Remove filter chip → filter removed
- [ ] Pause/Resume streaming
- [ ] Download logs
- [ ] Clear logs
- [ ] Auto-scroll works
- [ ] JSON logs show fields in Compact mode
- [ ] Plain text logs show as "unknown" level
- [ ] Status bar shows correct format percentage

---

## Summary

**Files Created:**
- `src/components/logs/hooks/useLogStream.ts`
- `src/components/logs/types.ts`
- `src/components/logs/LogLine.tsx`
- `src/components/logs/LogToolbar.tsx`
- `src/components/logs/LogFilters.tsx`
- `src/components/logs/LogStatusBar.tsx`
- `src/components/logs/index.ts`

**Files Modified:**
- `src-tauri/src/logs/mod.rs` (stricter parsing)
- `src/components/logs/LogViewer.tsx` (full rewrite)

**Total Commits:** ~12
