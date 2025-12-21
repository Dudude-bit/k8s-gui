import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

const BINARY_UNITS: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
};

const DECIMAL_UNITS: Record<string, number> = {
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
};

export function parseKubernetesQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)([a-zA-Z]+)?$/);
  if (!match) {
    return null;
  }

  const amount = Number.parseFloat(match[1]);
  if (Number.isNaN(amount)) {
    return null;
  }

  const unit = match[2] ?? "";
  if (!unit) {
    return amount;
  }

  if (unit === "m") {
    return amount / 1000;
  }

  if (unit in BINARY_UNITS) {
    return amount * BINARY_UNITS[unit];
  }

  if (unit in DECIMAL_UNITS) {
    return amount * DECIMAL_UNITS[unit];
  }

  return null;
}

export function formatKubernetesBytes(
  value: string | null | undefined,
  decimals = 1,
): string {
  if (!value) {
    return "-";
  }

  const bytes = parseKubernetesQuantity(value);
  if (bytes === null || Number.isNaN(bytes)) {
    return value;
  }

  return formatBytes(bytes, decimals);
}

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
