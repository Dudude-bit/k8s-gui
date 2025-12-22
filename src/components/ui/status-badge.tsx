/**
 * StatusBadge - Unified badge component for Kubernetes resource statuses
 * 
 * Provides consistent styling for all status indicators across the application.
 * Uses design system tokens for colors.
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        // Success states
        running: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        ready: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        available: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        succeeded: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        bound: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        
        // Pending/In-progress states
        pending: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        waiting: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        progressing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        creating: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        
        // Warning states
        warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
        degraded: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
        
        // Error states
        error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        crashloopbackoff: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        evicted: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        oomkilled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        imagepullbackoff: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        
        // Terminated/Completed states
        terminated: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
        completed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
        
        // Unknown/Default states
        unknown: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400",
        default: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400",
      },
      size: {
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  /** Status string - will be normalized to match variants */
  status?: string;
  /** Optional dot indicator */
  showDot?: boolean;
  /** Pulse animation for active states */
  pulse?: boolean;
}

// Status to variant mapping
const statusVariantMap: Record<string, VariantProps<typeof statusBadgeVariants>["variant"]> = {
  // Success
  running: "running",
  ready: "ready",
  available: "available",
  active: "active",
  succeeded: "succeeded",
  bound: "bound",
  true: "ready",
  
  // Pending
  pending: "pending",
  waiting: "waiting",
  progressing: "progressing",
  creating: "creating",
  containercreating: "creating",
  
  // Warning
  warning: "warning",
  degraded: "degraded",
  
  // Error
  error: "error",
  failed: "failed",
  crashloopbackoff: "crashloopbackoff",
  evicted: "evicted",
  oomkilled: "oomkilled",
  imagepullbackoff: "imagepullbackoff",
  errimagepull: "imagepullbackoff",
  false: "error",
  
  // Terminated
  terminated: "terminated",
  completed: "completed",
  
  // Unknown
  unknown: "unknown",
};

/**
 * Get variant from status string
 */
function getVariantFromStatus(
  status?: string
): VariantProps<typeof statusBadgeVariants>["variant"] {
  if (!status) return "default";
  const normalized = status.toLowerCase().replace(/[^a-z]/g, "");
  return statusVariantMap[normalized] || "default";
}

/**
 * StatusBadge component for displaying Kubernetes resource statuses
 * 
 * @example
 * // Basic usage with status
 * <StatusBadge status="Running" />
 * 
 * // With variant override
 * <StatusBadge variant="error">Custom Error</StatusBadge>
 * 
 * // With dot indicator
 * <StatusBadge status="Running" showDot />
 * 
 * // With pulse animation
 * <StatusBadge status="Pending" pulse />
 */
export function StatusBadge({
  className,
  variant,
  size,
  status,
  showDot,
  pulse,
  children,
  ...props
}: StatusBadgeProps) {
  // Determine variant from status if not explicitly provided
  const resolvedVariant = variant ?? getVariantFromStatus(status);
  
  // Get dot color based on variant
  const getDotColor = () => {
    switch (resolvedVariant) {
      case "running":
      case "ready":
      case "available":
      case "active":
      case "succeeded":
      case "bound":
        return "bg-green-500";
      case "pending":
      case "waiting":
      case "progressing":
      case "creating":
        return "bg-blue-500";
      case "warning":
      case "degraded":
        return "bg-yellow-500";
      case "error":
      case "failed":
      case "crashloopbackoff":
      case "evicted":
      case "oomkilled":
      case "imagepullbackoff":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <span
      className={cn(
        statusBadgeVariants({ variant: resolvedVariant, size }),
        pulse && "animate-pulse-subtle",
        className
      )}
      {...props}
    >
      {showDot && (
        <span
          className={cn(
            "mr-1.5 h-1.5 w-1.5 rounded-full",
            getDotColor(),
            pulse && "animate-pulse"
          )}
        />
      )}
      {children ?? status}
    </span>
  );
}

/**
 * ConditionBadge - Badge for Kubernetes conditions (True/False/Unknown)
 */
export interface ConditionBadgeProps extends Omit<StatusBadgeProps, "status"> {
  /** Condition status: "True", "False", or "Unknown" */
  conditionStatus: string;
  /** Condition type (e.g., "Ready", "Available") */
  conditionType?: string;
}

export function ConditionBadge({
  conditionStatus,
  conditionType,
  children,
  ...props
}: ConditionBadgeProps) {
  const normalizedStatus = conditionStatus.toLowerCase();
  let variant: VariantProps<typeof statusBadgeVariants>["variant"] = "unknown";
  
  if (normalizedStatus === "true") {
    variant = "ready";
  } else if (normalizedStatus === "false") {
    variant = "error";
  }
  
  return (
    <StatusBadge variant={variant} {...props}>
      {children ?? conditionType ?? conditionStatus}
    </StatusBadge>
  );
}

/**
 * ResourceTypeBadge - Badge for Kubernetes resource types
 */
export type ResourceType =
  | "pod"
  | "deployment"
  | "service"
  | "configmap"
  | "secret"
  | "node"
  | "namespace"
  | "ingress"
  | "pv"
  | "pvc"
  | "statefulset"
  | "daemonset"
  | "job"
  | "cronjob";

const resourceTypeColors: Record<ResourceType, string> = {
  pod: "bg-resource-pod-bg text-resource-pod dark:bg-blue-900/30 dark:text-blue-400",
  deployment: "bg-resource-deployment-bg text-resource-deployment dark:bg-purple-900/30 dark:text-purple-400",
  service: "bg-resource-service-bg text-resource-service dark:bg-green-900/30 dark:text-green-400",
  configmap: "bg-resource-configmap-bg text-resource-configmap dark:bg-yellow-900/30 dark:text-yellow-400",
  secret: "bg-resource-secret-bg text-resource-secret dark:bg-red-900/30 dark:text-red-400",
  node: "bg-resource-node-bg text-resource-node dark:bg-gray-900/30 dark:text-gray-400",
  namespace: "bg-resource-namespace-bg text-resource-namespace dark:bg-cyan-900/30 dark:text-cyan-400",
  ingress: "bg-resource-ingress-bg text-resource-ingress dark:bg-pink-900/30 dark:text-pink-400",
  pv: "bg-resource-pv-bg text-resource-pv dark:bg-emerald-900/30 dark:text-emerald-400",
  pvc: "bg-resource-pvc-bg text-resource-pvc dark:bg-teal-900/30 dark:text-teal-400",
  statefulset: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  daemonset: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  job: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  cronjob: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

export interface ResourceTypeBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  resourceType: ResourceType;
  size?: "sm" | "md" | "lg";
}

export function ResourceTypeBadge({
  resourceType,
  size = "md",
  className,
  children,
  ...props
}: ResourceTypeBadgeProps) {
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-0.5 text-xs",
    lg: "px-3 py-1 text-sm",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium transition-colors",
        sizeClasses[size],
        resourceTypeColors[resourceType],
        className
      )}
      {...props}
    >
      {children ?? resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}
    </span>
  );
}

export { statusBadgeVariants };

