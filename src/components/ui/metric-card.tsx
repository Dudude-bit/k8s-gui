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
  parseCPU,
  parseMemory,
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
  /** Used value (can be string like "500m" or number) */
  used: string | number | null | undefined;
  /** Total/limit value (can be string like "2" or number) */
  total: string | number | null | undefined;
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
  /** Parse function for custom type */
  parseValue?: (value: string) => number;
}

/**
 * MetricCard - Full card component for displaying a metric
 * 
 * @example
 * <MetricCard
 *   title="CPU Usage"
 *   used="500m"
 *   total="2"
 *   type="cpu"
 *   showProgressBar
 * />
 */
export function MetricCard({
  title,
  used,
  total,
  type,
  icon,
  showProgressBar = true,
  showPercentage = true,
  description,
  className,
  formatValue,
  parseValue,
}: MetricCardProps) {
  // Parse values based on type
  const parse = parseValue ?? (type === "cpu" ? parseCPU : parseMemory);
  const format = formatValue ?? (type === "cpu" ? formatCPU : formatMemory);

  const usedNum = typeof used === "number" ? used : parse(used ?? "0");
  const totalNum = typeof total === "number" ? total : parse(total ?? "0");
  
  const percentage = calculateUtilization(usedNum, totalNum);
  const colorVariant = getUtilizationColor(percentage);

  // Default icons based on type
  const defaultIcon = type === "cpu" 
    ? <Cpu className="h-4 w-4" />
    : type === "memory"
    ? <MemoryStick className="h-4 w-4" />
    : type === "storage"
    ? <HardDrive className="h-4 w-4" />
    : <Activity className="h-4 w-4" />;

  // Format display values
  const usedDisplay = used ? (typeof used === "string" ? used : format(usedNum)) : "-";
  const totalDisplay = total ? (typeof total === "string" ? total : format(totalNum)) : "-";

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <div className="flex items-center gap-2">
            {icon ?? defaultIcon}
            {title}
          </div>
          {showPercentage && percentage !== null && (
            <Badge variant={colorVariant === "destructive" ? "destructive" : "secondary"}>
              {percentage.toFixed(1)}%
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold">{usedDisplay}</span>
          <span className="text-sm text-muted-foreground">/ {totalDisplay}</span>
        </div>
        {showProgressBar && percentage !== null && (
          <Progress
            value={percentage}
            className={cn(
              "h-2",
              colorVariant === "destructive" && "[&>div]:bg-red-500",
              colorVariant === "secondary" && "[&>div]:bg-yellow-500"
            )}
          />
        )}
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
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
  used: string | number | null | undefined;
  /** Total/limit value (optional) */
  total?: string | number | null | undefined;
  /** Type of metric */
  type: "cpu" | "memory";
  /** Show percentage */
  showPercentage?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * MetricBadge - Compact inline metric display
 * 
 * @example
 * <MetricBadge used="500m" total="2" type="cpu" />
 */
export function MetricBadge({
  used,
  total,
  type,
  showPercentage = false,
  className,
}: MetricBadgeProps) {
  const parse = type === "cpu" ? parseCPU : parseMemory;
  const format = type === "cpu" ? formatCPU : formatMemory;

  const usedNum = typeof used === "number" ? used : parse(used ?? "0");
  const totalNum = total ? (typeof total === "number" ? total : parse(total)) : null;
  
  const percentage = totalNum ? calculateUtilization(usedNum, totalNum) : null;
  const colorVariant = getUtilizationColor(percentage);

  const usedDisplay = used ? (typeof used === "string" ? used : format(usedNum)) : "-";

  return (
    <Badge
      variant={colorVariant === "destructive" ? "destructive" : colorVariant === "secondary" ? "secondary" : "outline"}
      className={cn("font-mono text-xs", className)}
    >
      {usedDisplay}
      {showPercentage && percentage !== null && ` (${percentage.toFixed(0)}%)`}
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
  used: string | number | null | undefined;
  /** Total/limit value (optional) */
  total?: string | number | null | undefined;
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
  /** Parse function for custom type */
  parseValue?: (value: string) => number;
}

/**
 * MetricRow - Row display for key-value metrics with optional progress
 * 
 * @example
 * <MetricRow
 *   label="CPU"
 *   used="500m"
 *   total="2"
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
  parseValue,
}: MetricRowProps) {
  const parse = parseValue ?? (type === "cpu" ? parseCPU : parseMemory);
  const format = formatValue ?? (type === "cpu" ? formatCPU : formatMemory);

  const usedNum = typeof used === "number" ? used : parse(used ?? "0");
  const totalNum = total ? (typeof total === "number" ? total : parse(total)) : null;
  
  const percentage = totalNum ? calculateUtilization(usedNum, totalNum) : null;
  const colorVariant = getUtilizationColor(percentage);

  const usedDisplay = used ? (typeof used === "string" ? used : format(usedNum)) : "-";
  const totalDisplay = total ? (typeof total === "string" ? total : format(totalNum ?? 0)) : null;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">{usedDisplay}</span>
          {totalDisplay && (
            <span className="text-muted-foreground">/ {totalDisplay}</span>
          )}
          {percentage !== null && (
            <Badge
              variant={colorVariant === "destructive" ? "destructive" : "outline"}
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
  cpuUsed: string | null | undefined;
  /** CPU total/limit */
  cpuTotal?: string | null | undefined;
  /** Memory used */
  memoryUsed: string | null | undefined;
  /** Memory total/limit */
  memoryTotal?: string | null | undefined;
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
 *   cpuUsed="500m"
 *   cpuTotal="2"
 *   memoryUsed="512Mi"
 *   memoryTotal="4Gi"
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
  cpuCapacity: string | null | undefined;
  /** CPU allocatable */
  cpuAllocatable: string | null | undefined;
  /** Memory capacity */
  memoryCapacity: string | null | undefined;
  /** Memory allocatable */
  memoryAllocatable: string | null | undefined;
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
            <p className="font-medium">{cpuCapacity ?? "-"}</p>
            <p className="text-xs text-muted-foreground">
              {cpuAllocatable && `Allocatable: ${cpuAllocatable}`}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Memory Capacity</p>
            <p className="font-medium">{memoryCapacity ?? "-"}</p>
            <p className="text-xs text-muted-foreground">
              {memoryAllocatable && `Allocatable: ${memoryAllocatable}`}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default MetricCard;

