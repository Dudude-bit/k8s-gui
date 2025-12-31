import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind CSS conflict resolution
 *
 * @param inputs - Class values to merge
 * @returns Merged class string with conflicts resolved
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Re-export quantity utilities from k8s-quantity for backward compatibility
export {
  formatBytes,
  formatMemory,
  formatCPU,
  formatKubernetesBytes,
} from "./k8s-quantity";

/**
 * Format age from a timestamp string
 *
 * @param createdAt - ISO timestamp string or null
 * @returns Formatted age string (e.g., "5d", "2h", "30m", "10s") or "Unknown"
 */
export function formatAge(createdAt: string | null): string {
  if (!createdAt) return "Unknown";

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "Unknown";
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return `${diffSecs}s`;
}
