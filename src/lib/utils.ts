import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Re-export quantity utilities from k8s-quantity for backward compatibility
export {
  formatBytes,
  parseQuantity as parseKubernetesQuantity,
  formatKubernetesBytes,
} from './k8s-quantity';

export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

export function formatAge(createdAt: string | null): string {
  if (!createdAt) return "Unknown";

  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return `${diffSecs}s`;
}

export function getStatusColor(status: string): string {
  const statusLower = status.toLowerCase();

  if (
    ["running", "ready", "available", "active", "succeeded"].includes(
      statusLower,
    )
  ) {
    return "text-green-500";
  } else if (["pending", "waiting", "progressing"].includes(statusLower)) {
    return "text-blue-500";
  } else if (["warning", "degraded"].includes(statusLower)) {
    return "text-yellow-500";
  } else if (
    ["error", "failed", "crashloopbackoff", "evicted", "oomkilled"].includes(
      statusLower,
    )
  ) {
    return "text-red-500";
  } else if (["terminated", "completed"].includes(statusLower)) {
    return "text-gray-500";
  }

  return "text-muted-foreground";
}

export function getStatusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  const statusLower = status.toLowerCase();

  if (
    ["running", "ready", "available", "active", "succeeded"].includes(
      statusLower,
    )
  ) {
    return "default";
  } else if (
    ["error", "failed", "crashloopbackoff", "evicted", "oomkilled"].includes(
      statusLower,
    )
  ) {
    return "destructive";
  } else if (["pending", "waiting", "progressing"].includes(statusLower)) {
    return "secondary";
  }

  return "outline";
}
