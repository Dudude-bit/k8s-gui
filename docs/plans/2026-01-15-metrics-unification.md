# Metrics Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify metrics display across the application with smart percentage calculation and type-specific color thresholds.

**Architecture:** New `metrics-utils.ts` module handles all calculation logic. Existing components refactored to use `MetricState` interface. Thresholds differ by metric type (CPU: 80/95%, Memory: 70/85%).

**Tech Stack:** React, TypeScript, Tailwind CSS, Radix UI components

---

## Task 1: Create metrics-utils.ts with core logic

**Files:**
- Create: `src/lib/metrics-utils.ts`

**Step 1: Create the metrics-utils.ts file with types and thresholds**

```typescript
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
```

**Step 2: Run TypeScript check**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui/.worktrees/metrics-unification && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/metrics-utils.ts
git commit -m "feat(metrics): add metrics-utils.ts with types and thresholds"
```

---

## Task 2: Add calculateMetricState function

**Files:**
- Modify: `src/lib/metrics-utils.ts`

**Step 1: Add imports and calculateMetricState function**

Add to end of `src/lib/metrics-utils.ts`:

```typescript
import { formatCPU, formatMemory } from './k8s-quantity';

/**
 * Calculate complete metric state from raw values
 *
 * @param type - Metric type ('cpu' or 'memory')
 * @param usage - Current usage (millicores for CPU, bytes for memory)
 * @param request - Requested resources (same units as usage)
 * @param limit - Resource limit (same units as usage)
 * @returns Complete metric state for rendering
 *
 * @example
 * // CPU with limit
 * calculateMetricState('cpu', 500, 250, 1000)
 * // → { value: 500, displayValue: "500m", percentage: 50, base: 'limit', level: 'normal', hasLimit: true, hasRequest: true }
 *
 * // Memory without limit
 * calculateMetricState('memory', 400 * 1024 * 1024, 256 * 1024 * 1024, null)
 * // → { value: 419430400, displayValue: "400Mi", percentage: 156, base: 'request', level: 'critical', hasLimit: false, hasRequest: true }
 */
export function calculateMetricState(
  type: MetricType,
  usage: number | null,
  request: number | null,
  limit: number | null
): MetricState | null {
  if (usage === null || usage === undefined) {
    return null;
  }

  const format = type === 'cpu' ? formatCPU : formatMemory;
  const displayValue = format(usage);

  const { percentage, base } = calculatePercentage(usage, request, limit);
  const level = getUtilizationLevel(percentage, type);

  return {
    value: usage,
    displayValue,
    percentage,
    base,
    level,
    hasLimit: limit !== null && limit > 0,
    hasRequest: request !== null && request > 0,
  };
}

/**
 * Get CSS color class for utilization level
 */
export function getLevelColorClass(level: UtilizationLevel): string {
  switch (level) {
    case 'critical':
      return 'text-red-500';
    case 'warning':
      return 'text-yellow-500';
    default:
      return 'text-green-500';
  }
}

/**
 * Get badge variant for utilization level
 */
export function getLevelBadgeVariant(
  level: UtilizationLevel
): 'destructive' | 'secondary' | 'outline' {
  switch (level) {
    case 'critical':
      return 'destructive';
    case 'warning':
      return 'secondary';
    default:
      return 'outline';
  }
}

/**
 * Get progress bar color class for utilization level
 */
export function getLevelProgressClass(level: UtilizationLevel): string {
  switch (level) {
    case 'critical':
      return '[&>div]:bg-red-500';
    case 'warning':
      return '[&>div]:bg-yellow-500';
    default:
      return '';
  }
}
```

**Step 2: Run TypeScript check**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui/.worktrees/metrics-unification && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/metrics-utils.ts
git commit -m "feat(metrics): add calculateMetricState and helper functions"
```

---

## Task 3: Update getUtilizationColor in k8s-quantity.ts

**Files:**
- Modify: `src/lib/k8s-quantity.ts:281-288`

**Step 1: Update getUtilizationColor to accept optional type parameter**

Replace the `getUtilizationColor` function:

```typescript
/**
 * Get color variant based on utilization percentage
 * Now supports type-specific thresholds
 *
 * @param percentage - Utilization percentage
 * @param type - Optional metric type for type-specific thresholds
 * @returns Color variant name
 */
export function getUtilizationColor(
  percentage: number | null,
  type?: 'cpu' | 'memory'
): "default" | "secondary" | "destructive" {
  if (percentage === null) return "default";

  // Type-specific thresholds
  const thresholds = type === 'cpu'
    ? { warning: 80, critical: 95 }
    : type === 'memory'
      ? { warning: 70, critical: 85 }
      : { warning: 70, critical: 90 }; // default (backward compatible)

  if (percentage >= thresholds.critical) return "destructive";
  if (percentage >= thresholds.warning) return "secondary";
  return "default";
}
```

**Step 2: Run TypeScript check**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui/.worktrees/metrics-unification && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/k8s-quantity.ts
git commit -m "feat(metrics): add type-specific thresholds to getUtilizationColor"
```

---

## Task 4: Update MetricBadge component

**Files:**
- Modify: `src/components/ui/metric-card.tsx:152-207`

**Step 1: Update MetricBadge interface and implementation**

Replace the MetricBadge section (lines ~152-207):

```typescript
// ============================================================================
// MetricBadge - Compact inline metric display
// ============================================================================

export interface MetricBadgeProps {
  /** Used value */
  used: number | null | undefined;
  /** Request value (for percentage calculation fallback) */
  request?: number | null | undefined;
  /** Total/limit value */
  limit?: number | null | undefined;
  /** @deprecated Use 'limit' instead */
  total?: number | null | undefined;
  /** Type of metric */
  type: "cpu" | "memory";
  /** Show percentage */
  showPercentage?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * MetricBadge - Compact inline metric display with smart color coding
 *
 * Uses type-specific thresholds:
 * - CPU: warning at 80%, critical at 95%
 * - Memory: warning at 70%, critical at 85%
 *
 * @example
 * <MetricBadge used={500} request={250} limit={1000} type="cpu" />
 */
export function MetricBadge({
  used,
  request,
  limit,
  total, // deprecated, use limit
  type,
  showPercentage = false,
  className,
}: MetricBadgeProps) {
  const format = type === "cpu" ? formatCPU : formatMemory;

  const usedNum = typeof used === "number" ? used : null;
  const requestNum = typeof request === "number" ? request : null;
  const limitNum = typeof limit === "number" ? limit : typeof total === "number" ? total : null;

  const hasLimit = limitNum !== null && limitNum > 0;
  const hasRequest = requestNum !== null && requestNum > 0;

  // Smart percentage calculation: limit > request > null
  let percentage: number | null = null;
  if (usedNum !== null) {
    if (hasLimit) {
      percentage = calculateUtilization(usedNum, limitNum!);
    } else if (hasRequest) {
      percentage = Math.min(999, Math.max(0, (usedNum / requestNum!) * 100));
    }
  }

  const colorVariant = getUtilizationColor(percentage, type);
  const usedDisplay = usedNum !== null ? format(usedNum) : "-";

  // Show * indicator when no limit is configured
  const noLimitIndicator = usedNum !== null && !hasLimit ? " *" : "";

  return (
    <Badge
      variant={
        colorVariant === "destructive"
          ? "destructive"
          : colorVariant === "secondary"
            ? "secondary"
            : "outline"
      }
      className={cn("font-mono text-xs", className)}
      title={
        usedNum !== null
          ? hasLimit
            ? `${usedDisplay} / ${format(limitNum!)} (${percentage?.toFixed(1)}% of limit)`
            : hasRequest
              ? `${usedDisplay} / ${format(requestNum!)} request (${percentage?.toFixed(1)}% of request, no limit)`
              : `${usedDisplay} (no request/limit configured)`
          : undefined
      }
    >
      {usedDisplay}
      {showPercentage && percentage !== null && ` (${percentage.toFixed(0)}%)`}
      {noLimitIndicator}
    </Badge>
  );
}
```

**Step 2: Run TypeScript check**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui/.worktrees/metrics-unification && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/ui/metric-card.tsx
git commit -m "feat(metrics): update MetricBadge with smart percentage and tooltip"
```

---

## Task 5: Update MetricCard component

**Files:**
- Modify: `src/components/ui/metric-card.tsx:25-147`

**Step 1: Update MetricCard interface and implementation**

Replace the MetricCard section (lines ~25-147):

```typescript
// ============================================================================
// MetricCard - Primary metric display component
// ============================================================================

export interface MetricCardProps {
  /** Title for the metric card */
  title: string;
  /** Used value (millicores/bytes depending on type) */
  used: number | null | undefined;
  /** Request value for percentage calculation fallback */
  request?: number | null | undefined;
  /** Total/limit value (millicores/bytes depending on type) */
  limit?: number | null | undefined;
  /** @deprecated Use 'limit' instead */
  total?: number | null | undefined;
  /** Type of metric for parsing and formatting */
  type: "cpu" | "memory" | "storage" | "custom";
  /** Custom icon (defaults to CPU/Memory based on type) */
  icon?: React.ReactNode;
  /** Show progress bar */
  showProgressBar?: boolean;
  /** Show percentage badge */
  showPercentage?: boolean;
  /** Additional description */
  description?: string;
  /** Custom className */
  className?: string;
  /** Format function for custom type */
  formatValue?: (value: number) => string;
}

/**
 * MetricCard - Full card component for displaying a metric
 *
 * Uses type-specific thresholds:
 * - CPU: warning at 80%, critical at 95%
 * - Memory: warning at 70%, critical at 85%
 *
 * @example
 * <MetricCard
 *   title="CPU Usage"
 *   used={500}
 *   request={250}
 *   limit={2000}
 *   type="cpu"
 *   showProgressBar
 * />
 */
export function MetricCard({
  title,
  used,
  request,
  limit,
  total, // deprecated
  type,
  icon,
  showProgressBar = true,
  showPercentage = true,
  description,
  className,
  formatValue,
}: MetricCardProps) {
  const format =
    formatValue ??
    (type === "cpu"
      ? formatCPU
      : type === "memory" || type === "storage"
        ? formatMemory
        : (value: number) => `${value}`);

  const usedNum = typeof used === "number" ? used : null;
  const requestNum = typeof request === "number" ? request : null;
  const limitNum = typeof limit === "number" ? limit : typeof total === "number" ? total : null;

  const hasLimit = limitNum !== null && limitNum > 0;
  const hasRequest = requestNum !== null && requestNum > 0;

  // Smart percentage calculation: limit > request > null
  let percentage: number | null = null;
  let percentageBase: "limit" | "request" | null = null;

  if (usedNum !== null) {
    if (hasLimit) {
      percentage = calculateUtilization(usedNum, limitNum!);
      percentageBase = "limit";
    } else if (hasRequest) {
      percentage = Math.min(999, Math.max(0, (usedNum / requestNum!) * 100));
      percentageBase = "request";
    }
  }

  const metricType = type === "cpu" ? "cpu" : type === "memory" || type === "storage" ? "memory" : undefined;
  const colorVariant = getUtilizationColor(percentage, metricType);

  // Default icons based on type
  const defaultIcon =
    type === "cpu" ? (
      <Cpu className="h-4 w-4" />
    ) : type === "memory" ? (
      <MemoryStick className="h-4 w-4" />
    ) : type === "storage" ? (
      <HardDrive className="h-4 w-4" />
    ) : (
      <Activity className="h-4 w-4" />
    );

  // Format display values
  const usedDisplay = usedNum !== null ? format(usedNum) : "-";
  const baseDisplay = hasLimit
    ? format(limitNum!)
    : hasRequest
      ? `${format(requestNum!)} req`
      : "-";

  // Progress bar style: dashed when no limit
  const progressBarClass = cn(
    "h-2",
    colorVariant === "destructive" && "[&>div]:bg-red-500",
    colorVariant === "secondary" && "[&>div]:bg-yellow-500",
    !hasLimit && hasRequest && "[&>div]:bg-opacity-60"
  );

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <div className="flex items-center gap-2">
            {icon ?? defaultIcon}
            {title}
          </div>
          {showPercentage && percentage !== null && (
            <Badge
              variant={
                colorVariant === "destructive" ? "destructive" : "secondary"
              }
            >
              {percentage.toFixed(1)}%
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold">{usedDisplay}</span>
          <span className="text-sm text-muted-foreground">
            / {baseDisplay}
            {!hasLimit && hasRequest && (
              <span className="ml-1 text-yellow-500" title="No limit configured">*</span>
            )}
          </span>
        </div>
        {showProgressBar && percentage !== null && (
          <Progress
            value={Math.min(100, percentage)}
            className={progressBarClass}
          />
        )}
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {hasRequest && hasLimit && (
          <p className="text-xs text-muted-foreground">
            Request: {format(requestNum!)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Run TypeScript check**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui/.worktrees/metrics-unification && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/ui/metric-card.tsx
git commit -m "feat(metrics): update MetricCard with smart percentage and request display"
```

---

## Task 6: Update column factories for CPU and Memory

**Files:**
- Modify: `src/components/resources/columns.tsx:139-177`

**Step 1: Update createCpuColumn and createMemoryColumn**

Replace lines ~139-177:

```typescript
/**
 * Creates a CPU usage column with MetricBadge component
 * Uses smart percentage: limit > request > no percentage
 */
export function createCpuColumn<
  T extends WithCpuUsage & Partial<WithCpuLimits>,
>(): ColumnDef<T> {
  return {
    id: "cpu",
    header: "CPU",
    cell: ({ row }) => {
      const used = row.original.cpuMillicores ?? null;
      const request = row.original.cpuRequests
        ? parseCPU(row.original.cpuRequests)
        : null;
      const limit = row.original.cpuLimits
        ? parseCPU(row.original.cpuLimits)
        : null;
      return (
        <MetricBadge
          used={used}
          request={request}
          limit={limit}
          type="cpu"
        />
      );
    },
  };
}

/**
 * Creates a Memory usage column with MetricBadge component
 * Uses smart percentage: limit > request > no percentage
 */
export function createMemoryColumn<
  T extends WithMemoryUsage & Partial<WithMemoryLimits>,
>(): ColumnDef<T> {
  return {
    id: "memory",
    header: "Memory",
    cell: ({ row }) => {
      const used = row.original.memoryBytes ?? null;
      const request = row.original.memoryRequests
        ? parseMemory(row.original.memoryRequests)
        : null;
      const limit = row.original.memoryLimits
        ? parseMemory(row.original.memoryLimits)
        : null;
      return (
        <MetricBadge
          used={used}
          request={request}
          limit={limit}
          type="memory"
        />
      );
    },
  };
}
```

**Step 2: Run TypeScript check**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui/.worktrees/metrics-unification && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/resources/columns.tsx
git commit -m "feat(metrics): update column factories with request support"
```

---

## Task 7: Update MetricRow and MetricPair components

**Files:**
- Modify: `src/components/ui/metric-card.tsx:209-382`

**Step 1: Update MetricRow interface and implementation**

Replace MetricRow section:

```typescript
// ============================================================================
// MetricRow - Row display for key-value metrics
// ============================================================================

export interface MetricRowProps {
  /** Label for the metric */
  label: string;
  /** Used value */
  used: number | null | undefined;
  /** Request value */
  request?: number | null | undefined;
  /** Total/limit value */
  limit?: number | null | undefined;
  /** @deprecated Use 'limit' instead */
  total?: number | null | undefined;
  /** Type of metric */
  type: "cpu" | "memory" | "custom";
  /** Icon to display */
  icon?: React.ReactNode;
  /** Show progress bar */
  showProgressBar?: boolean;
  /** Custom className */
  className?: string;
  /** Format function for custom type */
  formatValue?: (value: number) => string;
}

/**
 * MetricRow - Row display for key-value metrics with optional progress
 */
export function MetricRow({
  label,
  used,
  request,
  limit,
  total, // deprecated
  type,
  icon,
  showProgressBar = false,
  className,
  formatValue,
}: MetricRowProps) {
  const format =
    formatValue ??
    (type === "cpu"
      ? formatCPU
      : type === "memory"
        ? formatMemory
        : (value: number) => `${value}`);

  const usedNum = typeof used === "number" ? used : null;
  const requestNum = typeof request === "number" ? request : null;
  const limitNum = typeof limit === "number" ? limit : typeof total === "number" ? total : null;

  const hasLimit = limitNum !== null && limitNum > 0;
  const hasRequest = requestNum !== null && requestNum > 0;

  // Smart percentage calculation
  let percentage: number | null = null;
  if (usedNum !== null) {
    if (hasLimit) {
      percentage = calculateUtilization(usedNum, limitNum!);
    } else if (hasRequest) {
      percentage = Math.min(999, Math.max(0, (usedNum / requestNum!) * 100));
    }
  }

  const metricType = type === "cpu" ? "cpu" : type === "memory" ? "memory" : undefined;
  const colorVariant = getUtilizationColor(percentage, metricType);

  const usedDisplay = usedNum !== null ? format(usedNum) : "-";
  const baseDisplay = hasLimit
    ? format(limitNum!)
    : hasRequest
      ? `${format(requestNum!)} req`
      : null;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">{usedDisplay}</span>
          {baseDisplay !== null && (
            <span className="text-muted-foreground">/ {baseDisplay}</span>
          )}
          {!hasLimit && hasRequest && (
            <span className="text-yellow-500 text-xs" title="No limit">*</span>
          )}
          {percentage !== null && (
            <Badge
              variant={
                colorVariant === "destructive" ? "destructive" : "outline"
              }
              className="text-xs"
            >
              {percentage.toFixed(0)}%
            </Badge>
          )}
        </div>
      </div>
      {showProgressBar && percentage !== null && (
        <Progress
          value={Math.min(100, percentage)}
          className={cn(
            "h-1.5",
            colorVariant === "destructive" && "[&>div]:bg-red-500",
            colorVariant === "secondary" && "[&>div]:bg-yellow-500"
          )}
        />
      )}
    </div>
  );
}

// ============================================================================
// MetricPair - Paired CPU/Memory display
// ============================================================================

export interface MetricPairProps {
  /** CPU used */
  cpuUsed: number | null | undefined;
  /** CPU request */
  cpuRequest?: number | null | undefined;
  /** CPU total/limit */
  cpuLimit?: number | null | undefined;
  /** @deprecated Use cpuLimit */
  cpuTotal?: number | null | undefined;
  /** Memory used */
  memoryUsed: number | null | undefined;
  /** Memory request */
  memoryRequest?: number | null | undefined;
  /** Memory total/limit */
  memoryLimit?: number | null | undefined;
  /** @deprecated Use memoryLimit */
  memoryTotal?: number | null | undefined;
  /** Show progress bars */
  showProgressBar?: boolean;
  /** Orientation */
  orientation?: "horizontal" | "vertical";
  /** Custom className */
  className?: string;
}

/**
 * MetricPair - Display CPU and Memory metrics together
 */
export function MetricPair({
  cpuUsed,
  cpuRequest,
  cpuLimit,
  cpuTotal, // deprecated
  memoryUsed,
  memoryRequest,
  memoryLimit,
  memoryTotal, // deprecated
  showProgressBar = false,
  orientation = "vertical",
  className,
}: MetricPairProps) {
  return (
    <div
      className={cn(
        orientation === "horizontal" ? "flex gap-4" : "space-y-2",
        className
      )}
    >
      <MetricRow
        label="CPU"
        used={cpuUsed}
        request={cpuRequest}
        limit={cpuLimit ?? cpuTotal}
        type="cpu"
        icon={<Cpu className="h-4 w-4" />}
        showProgressBar={showProgressBar}
        className={orientation === "horizontal" ? "flex-1" : undefined}
      />
      <MetricRow
        label="Memory"
        used={memoryUsed}
        request={memoryRequest}
        limit={memoryLimit ?? memoryTotal}
        type="memory"
        icon={<MemoryStick className="h-4 w-4" />}
        showProgressBar={showProgressBar}
        className={orientation === "horizontal" ? "flex-1" : undefined}
      />
    </div>
  );
}
```

**Step 2: Run TypeScript check**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui/.worktrees/metrics-unification && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/ui/metric-card.tsx
git commit -m "feat(metrics): update MetricRow and MetricPair with request support"
```

---

## Task 8: Add aggregateContainerResources helper

**Files:**
- Modify: `src/lib/metrics.ts`

**Step 1: Add aggregation helper at end of file**

Add to end of `src/lib/metrics.ts`:

```typescript
import { parseCPU, parseMemory } from './k8s-quantity';

/**
 * Aggregated resource values in parsed form
 */
export interface AggregatedResources {
  cpuRequest: number | null;
  cpuLimit: number | null;
  memoryRequest: number | null;
  memoryLimit: number | null;
}

/**
 * Aggregate resource requests and limits from a pod
 *
 * @param pod - Pod with cpuRequests, cpuLimits, memoryRequests, memoryLimits
 * @returns Parsed resource values
 */
export function aggregatePodResources(pod: {
  cpuRequests?: string | null;
  cpuLimits?: string | null;
  memoryRequests?: string | null;
  memoryLimits?: string | null;
}): AggregatedResources {
  return {
    cpuRequest: pod.cpuRequests ? parseCPU(pod.cpuRequests) : null,
    cpuLimit: pod.cpuLimits ? parseCPU(pod.cpuLimits) : null,
    memoryRequest: pod.memoryRequests ? parseMemory(pod.memoryRequests) : null,
    memoryLimit: pod.memoryLimits ? parseMemory(pod.memoryLimits) : null,
  };
}

/**
 * Aggregate resources across multiple pods
 *
 * @param pods - Array of pods with resource specs
 * @returns Summed resource values
 */
export function aggregateMultiplePodResources(
  pods: Array<{
    cpuRequests?: string | null;
    cpuLimits?: string | null;
    memoryRequests?: string | null;
    memoryLimits?: string | null;
  }>
): AggregatedResources {
  let cpuRequest = 0;
  let cpuLimit = 0;
  let memoryRequest = 0;
  let memoryLimit = 0;
  let hasCpuRequest = false;
  let hasCpuLimit = false;
  let hasMemoryRequest = false;
  let hasMemoryLimit = false;

  for (const pod of pods) {
    if (pod.cpuRequests) {
      hasCpuRequest = true;
      cpuRequest += parseCPU(pod.cpuRequests);
    }
    if (pod.cpuLimits) {
      hasCpuLimit = true;
      cpuLimit += parseCPU(pod.cpuLimits);
    }
    if (pod.memoryRequests) {
      hasMemoryRequest = true;
      memoryRequest += parseMemory(pod.memoryRequests);
    }
    if (pod.memoryLimits) {
      hasMemoryLimit = true;
      memoryLimit += parseMemory(pod.memoryLimits);
    }
  }

  return {
    cpuRequest: hasCpuRequest ? cpuRequest : null,
    cpuLimit: hasCpuLimit ? cpuLimit : null,
    memoryRequest: hasMemoryRequest ? memoryRequest : null,
    memoryLimit: hasMemoryLimit ? memoryLimit : null,
  };
}
```

**Step 2: Run TypeScript check**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui/.worktrees/metrics-unification && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/metrics.ts
git commit -m "feat(metrics): add resource aggregation helpers"
```

---

## Task 9: Add PodWithResources type

**Files:**
- Modify: `src/lib/metrics.ts`

**Step 1: Update PodWithMetrics to include resources**

Add after line ~6 (after PodWithMetrics interface):

```typescript
export interface PodWithMetricsAndResources extends PodWithMetrics {
  aggregatedResources: AggregatedResources;
}

/**
 * Merge pods with metrics AND parse resource specs
 */
export function mergePodsWithMetricsAndResources(
  pods: PodInfo[],
  metrics: PodMetrics[]
): PodWithMetricsAndResources[] {
  const withMetrics = mergePodsWithMetrics(pods, metrics);

  return withMetrics.map((pod) => ({
    ...pod,
    aggregatedResources: aggregatePodResources(pod),
  }));
}
```

**Step 2: Update imports at top of file**

Add AggregatedResources to exports.

**Step 3: Run TypeScript check**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui/.worktrees/metrics-unification && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/lib/metrics.ts
git commit -m "feat(metrics): add PodWithMetricsAndResources type"
```

---

## Task 10: Final verification and cleanup

**Step 1: Run full TypeScript check**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui/.worktrees/metrics-unification && npx tsc --noEmit`
Expected: No errors

**Step 2: Run linter**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui/.worktrees/metrics-unification && npm run lint`
Expected: No errors (or only warnings)

**Step 3: Test build**

Run: `cd /Users/kirillinakin/RustroverProjects/k8s-gui/.worktrees/metrics-unification && npm run build`
Expected: Build succeeds

**Step 4: Create final commit if any lint fixes needed**

```bash
git add -A
git commit -m "chore: lint fixes and cleanup"
```

---

## Summary

This plan implements:
1. New `metrics-utils.ts` with type-specific thresholds (CPU: 80/95%, Memory: 70/85%)
2. Smart percentage calculation (limit > request > null)
3. Updated MetricBadge with tooltips and no-limit indicator (*)
4. Updated MetricCard with request display
5. Updated MetricRow and MetricPair
6. Updated column factories for tables
7. Resource aggregation helpers

After completion, all metrics across the app will:
- Use type-specific color thresholds
- Show percentage from limit when available, request as fallback
- Display * indicator when no limit is configured
- Show detailed tooltips on hover
