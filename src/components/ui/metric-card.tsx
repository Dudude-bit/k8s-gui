/**
 * MetricCard - Unified component for displaying CPU/Memory metrics
 *
 * Provides consistent styling for resource usage visualization across the application.
 * Uses design system tokens for colors and animations.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  formatCPU,
  formatMemory,
  calculateUtilization,
  getUtilizationColor,
} from "@/lib/k8s-quantity";
import { Cpu, MemoryStick, Activity, HardDrive } from "lucide-react";

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

  if (usedNum !== null) {
    if (hasLimit) {
      percentage = calculateUtilization(usedNum, limitNum!);
    } else if (hasRequest) {
      percentage = Math.min(999, Math.max(0, (usedNum / requestNum!) * 100));
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

// ============================================================================
// MetricRow - Row display for key-value metrics
// ============================================================================

export interface MetricRowProps {
  /** Label for the metric */
  label: string;
  /** Used value */
  used: number | null | undefined;
  /** Total/limit value (optional) */
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
 *
 * @example
 * <MetricRow
 *   label="CPU"
 *   used={500}
 *   total={2000}
 *   type="cpu"
 *   icon={<Cpu className="h-4 w-4" />}
 *   showProgressBar
 * />
 */
export function MetricRow({
  label,
  used,
  total,
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
  const totalNum = typeof total === "number" ? total : null;

  const percentage =
    usedNum !== null && totalNum !== null
      ? calculateUtilization(usedNum, totalNum)
      : null;
  const colorVariant = getUtilizationColor(percentage);

  const usedDisplay = usedNum !== null ? format(usedNum) : "-";
  const totalDisplay = totalNum !== null ? format(totalNum) : null;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">{usedDisplay}</span>
          {totalNum !== null && (
            <span className="text-muted-foreground">/ {totalDisplay}</span>
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
          value={percentage}
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
  /** CPU total/limit */
  cpuTotal?: number | null | undefined;
  /** Memory used */
  memoryUsed: number | null | undefined;
  /** Memory total/limit */
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
 *
 * @example
 * <MetricPair
 *   cpuUsed={500}
 *   cpuTotal={2000}
 *   memoryUsed={536870912}
 *   memoryTotal={4294967296}
 *   showProgressBar
 * />
 */
export function MetricPair({
  cpuUsed,
  cpuTotal,
  memoryUsed,
  memoryTotal,
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
        total={cpuTotal}
        type="cpu"
        icon={<Cpu className="h-4 w-4" />}
        showProgressBar={showProgressBar}
        className={orientation === "horizontal" ? "flex-1" : undefined}
      />
      <MetricRow
        label="Memory"
        used={memoryUsed}
        total={memoryTotal}
        type="memory"
        icon={<MemoryStick className="h-4 w-4" />}
        showProgressBar={showProgressBar}
        className={orientation === "horizontal" ? "flex-1" : undefined}
      />
    </div>
  );
}

// ============================================================================
// NodeResourceCard - Node capacity display
// ============================================================================

export interface NodeResourceCardProps {
  /** Node name */
  nodeName: string;
  /** CPU capacity */
  cpuCapacity: number | null | undefined;
  /** CPU allocatable */
  cpuAllocatable: number | null | undefined;
  /** Memory capacity */
  memoryCapacity: number | null | undefined;
  /** Memory allocatable */
  memoryAllocatable: number | null | undefined;
  /** Custom className */
  className?: string;
}

/**
 * NodeResourceCard - Display node resource capacity
 */
export function NodeResourceCard({
  nodeName,
  cpuCapacity,
  cpuAllocatable,
  memoryCapacity,
  memoryAllocatable,
  className,
}: NodeResourceCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{nodeName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">CPU Capacity</p>
            <p className="font-medium">
              {cpuCapacity !== null && cpuCapacity !== undefined
                ? formatCPU(cpuCapacity)
                : "-"}
            </p>
            <p className="text-xs text-muted-foreground">
              {cpuAllocatable !== null &&
                cpuAllocatable !== undefined &&
                `Allocatable: ${formatCPU(cpuAllocatable)}`}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              Memory Capacity
            </p>
            <p className="font-medium">
              {memoryCapacity !== null && memoryCapacity !== undefined
                ? formatMemory(memoryCapacity)
                : "-"}
            </p>
            <p className="text-xs text-muted-foreground">
              {memoryAllocatable !== null &&
                memoryAllocatable !== undefined &&
                `Allocatable: ${formatMemory(memoryAllocatable)}`}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default MetricCard;
