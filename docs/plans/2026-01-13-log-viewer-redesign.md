# Log Viewer Redesign - Grafana/Loki Style

## Overview

Полный редизайн системы логов с улучшением парсинга на бэкенде и новым UI в стиле Grafana/Loki.

## Current Problems

### 1. Format Detection False Positives
- JSON detector triggers on any `{...}` string
- logfmt detector triggers on any `key=value` in text
- LogLevel::parse() finds "error" anywhere in message

### 2. Confusing UI States
- Three states: default (neither), Pretty, Raw - unclear difference
- "lines" selector is tail_lines, not UI limit - confusing

### 3. Code Structure
- Single 687-line file
- Mixed concerns (streaming, filtering, rendering)

## Design Decisions

- **Parsing location**: Backend (Rust) - more efficient, keeps current architecture
- **Default view**: Compact mode
- **Initial lines control**: Single selector (100/500/1000/5000)
- **Buffer limit**: Fixed at 5000 (existing MAX_LOG_LINES)
- **Component structure**: Split into multiple files with hooks

## Phase 1: Backend (Rust) - Improved Parsing

### 1.1 Stricter JSON Detection

```rust
// Current: starts_with('{')
// New: require structured log fields

fn is_structured_json(json: &Value) -> bool {
    let obj = match json.as_object() { Some(o) => o, None => return false };
    // Must contain at least one of: msg/message/level/time/ts/timestamp
    obj.contains_key("msg") || obj.contains_key("message") ||
    obj.contains_key("level") || obj.contains_key("time") ||
    obj.contains_key("ts") || obj.contains_key("timestamp")
}
```

### 1.2 Stricter logfmt Detection

```rust
// Current: any key=value
// New: minimum 2 pairs, alphanumeric keys only

fn is_logfmt(message: &str) -> bool {
    let pairs: Vec<_> = message.split_whitespace()
        .filter(|p| p.contains('='))
        .collect();
    pairs.len() >= 2 && pairs.iter().all(|p| {
        let key = p.split('=').next().unwrap_or("");
        !key.is_empty() && key.chars().all(|c| c.is_alphanumeric() || c == '_')
    })
}
```

### 1.3 Remove Aggressive Level Detection

```rust
// Current: LogLevel::parse() searches for "error"/"warn" in any text
// New: Only detect level from structured fields or klog prefix
// For plain text: always Unknown
```

### Files to Modify
- `src-tauri/src/logs/mod.rs`

## Phase 2: Frontend - Component Structure

### New Directory Structure

```
src/components/logs/
├── LogViewer.tsx          # Main container, state management
├── LogToolbar.tsx         # Filter panel and controls
├── LogLine.tsx            # Single log line renderer
├── LogFields.tsx          # Clickable fields for structured logs
├── LogFilters.tsx         # Active filters (chips)
├── LogStatusBar.tsx       # Statistics footer
├── hooks/
│   ├── useLogStream.ts    # Stream connection logic
│   └── useLogFilter.ts    # Log filtering
└── types.ts               # Shared types
```

### Component Responsibilities

**LogViewer.tsx** (~100 lines)
- State: logs[], filters, viewMode
- Orchestrates child components
- Keyboard shortcuts handler

**useLogStream.ts** (~150 lines)
- Stream lifecycle (connect/disconnect)
- Event listener management
- Buffer management (MAX_LOG_LINES)
- Error handling

**useLogFilter.ts** (~80 lines)
- Filter state management
- Filter application logic
- Memoized filtered logs

**LogToolbar.tsx** (~120 lines)
- Container selector
- Initial lines selector
- Search input
- View mode toggle (Compact/Table/Raw)
- Action buttons (clear, download, pause)

**LogLine.tsx** (~100 lines)
- Render based on viewMode
- Level badge with color
- Timestamp formatting
- Message with search highlighting

**LogFields.tsx** (~80 lines)
- Render structured fields
- Click handler → add filter
- Hidden field keys filtering

**LogFilters.tsx** (~60 lines)
- Active filter chips
- Remove filter on click

**LogStatusBar.tsx** (~50 lines)
- Line count
- Detected format
- Streaming indicator
- Log rate (lines/sec)

## Phase 3: New UI Features

### 3.1 Three View Modes

| Mode | Description |
|------|-------------|
| **Compact** (default) | Single line: `[time] [level] message {fields...}` |
| **Table** | Columns: Time \| Level \| Message \| Fields |
| **Raw** | Original string, no parsing |

### 3.2 Filter Panel (Loki-style)

```
┌─────────────────────────────────────────────────────────────┐
│ [Container ▾] [Level ▾] [Search...________] [⚙ View ▾]     │
│                                                             │
│ Active filters: level=error × namespace=prod ×              │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Clickable Fields
- Click on field `user=john` → adds filter `user=john`
- Click on level badge → filters by that level
- Right-click → "Exclude this value"

### 3.4 Enhanced Status Bar

```
┌─────────────────────────────────────────────────────────────┐
│ 1,234 lines │ Format: JSON (98%) │ ● Streaming │ Rate: ~50/s│
└─────────────────────────────────────────────────────────────┘
```

## Phase 4: Polish

- Keyboard shortcuts (j/k navigation, f for search, Esc to clear)
- Save preferences to localStorage (viewMode, initial lines)
- Improve performance with virtualized list (if needed)

## Implementation Order

1. **Backend fixes** - Fix false positives first
2. **Extract hooks** - useLogStream, useLogFilter
3. **Split components** - LogToolbar, LogLine, LogFields, LogStatusBar
4. **Add view modes** - Compact/Table/Raw
5. **Add filtering** - Level filter, clickable fields
6. **Polish** - Keyboard shortcuts, persistence

## Testing Plan

### Backend Tests
- JSON: valid structured log vs arbitrary JSON
- logfmt: proper key=value vs sentence with equals
- klog: correct prefix format
- Level detection: only from structured fields

### Frontend Tests
- View mode switching
- Filter addition/removal
- Stream lifecycle (connect/pause/resume/disconnect)
- Search highlighting

## Open Questions

None - all decisions made during brainstorming session.
