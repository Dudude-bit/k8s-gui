/**
 * Utility functions for creating CRD plugins
 */

import type { CrdPlugin, CrdPluginColumn, CrdPluginStatusConfig } from "./types";
import type { CustomResourceInfo, CustomResourceDetailInfo } from "@/generated/types";

/**
 * Create a matcher function that matches by API group
 *
 * @param targetGroup - The API group to match (e.g., "cert-manager.io")
 * @returns Matcher function
 *
 * @example
 * ```ts
 * const plugin: CrdPlugin = {
 *   matches: matchByGroup("cert-manager.io"),
 *   // ...
 * };
 * ```
 */
export function matchByGroup(targetGroup: string): CrdPlugin["matches"] {
  const normalizedTarget = targetGroup.toLowerCase();
  return (group) => group.toLowerCase() === normalizedTarget;
}

/**
 * Create a matcher function that matches by API group and kind
 *
 * @param targetGroup - The API group to match
 * @param targetKind - The kind to match
 * @returns Matcher function
 */
export function matchByGroupAndKind(
  targetGroup: string,
  targetKind: string
): CrdPlugin["matches"] {
  const normalizedGroup = targetGroup.toLowerCase();
  const normalizedKind = targetKind.toLowerCase();
  return (group, kind) =>
    group.toLowerCase() === normalizedGroup &&
    kind.toLowerCase() === normalizedKind;
}

/**
 * Create a matcher function that matches multiple CRDs
 *
 * @param matchers - Array of [group, kind] tuples or just groups
 * @returns Matcher function
 *
 * @example
 * ```ts
 * const plugin: CrdPlugin = {
 *   matches: matchMultiple([
 *     ["cert-manager.io", "Certificate"],
 *     ["cert-manager.io", "Issuer"],
 *     ["cert-manager.io", "ClusterIssuer"],
 *   ]),
 * };
 * ```
 */
export function matchMultiple(
  matchers: Array<[string, string?]>
): CrdPlugin["matches"] {
  const normalizedMatchers = matchers.map(([group, kind]) => ({
    group: group.toLowerCase(),
    kind: kind?.toLowerCase(),
  }));

  return (group, kind) => {
    const normalizedGroup = group.toLowerCase();
    const normalizedKind = kind.toLowerCase();

    return normalizedMatchers.some(
      (m) =>
        m.group === normalizedGroup &&
        (m.kind === undefined || m.kind === normalizedKind)
    );
  };
}

/**
 * Create a matcher function using regex patterns
 *
 * @param groupPattern - Regex pattern for API group
 * @param kindPattern - Optional regex pattern for kind
 * @returns Matcher function
 *
 * @example
 * ```ts
 * const plugin: CrdPlugin = {
 *   matches: matchByPattern(/^traefik\.(io|containo\.us)$/),
 * };
 * ```
 */
export function matchByPattern(
  groupPattern: RegExp,
  kindPattern?: RegExp
): CrdPlugin["matches"] {
  return (group, kind) => {
    if (!groupPattern.test(group)) return false;
    if (kindPattern && !kindPattern.test(kind)) return false;
    return true;
  };
}

/**
 * Extract a value from a resource using a JSON path
 *
 * @param resource - The resource object
 * @param path - Dot-separated path (e.g., "spec.secretName" or "status.conditions[0].type")
 * @returns The value at the path or undefined
 */
export function getValueByPath(
  resource: CustomResourceInfo | CustomResourceDetailInfo,
  path: string
): unknown {
  const parts = path.split(".");
  let current: unknown = resource;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;

    // Handle array notation like "conditions[0]"
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = (current as Record<string, unknown>)[key];
      if (Array.isArray(current)) {
        current = current[parseInt(index, 10)];
      } else {
        return undefined;
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Create a simple column definition
 *
 * @param id - Column ID
 * @param header - Column header text
 * @param path - JSON path to extract value from resource
 * @param options - Additional options
 */
export function createColumn(
  id: string,
  header: string,
  path: string,
  options?: {
    width?: number | string;
    sortable?: boolean;
    formatter?: (value: unknown) => React.ReactNode;
  }
): CrdPluginColumn {
  return {
    id,
    header,
    accessor: (resource) => getValueByPath(resource, path),
    cell: options?.formatter
      ? (value) => options.formatter!(value)
      : undefined,
    width: options?.width,
    sortable: options?.sortable ?? true,
  };
}

/**
 * Create a status configuration based on common patterns
 *
 * @param statusPath - Path to the status field (e.g., "status.phase")
 * @param statusMap - Map of status values to variants
 */
export function createStatusConfig(
  statusPath: string,
  statusMap?: Record<string, "default" | "secondary" | "destructive" | "outline">
): CrdPluginStatusConfig {
  const defaultMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    ready: "default",
    true: "default",
    running: "default",
    active: "default",
    healthy: "default",
    succeeded: "default",
    bound: "default",

    notready: "destructive",
    false: "destructive",
    failed: "destructive",
    error: "destructive",

    pending: "secondary",
    progressing: "secondary",
    unknown: "secondary",
    waiting: "secondary",
  };

  const mergedMap = { ...defaultMap, ...statusMap };

  return {
    getStatus: (resource) => {
      const value = getValueByPath(resource, statusPath);
      if (typeof value === "string") return value;
      if (typeof value === "boolean") return value ? "True" : "False";
      return null;
    },
    getVariant: (status) => {
      const normalized = status.toLowerCase();
      return mergedMap[normalized] ?? "outline";
    },
  };
}

/**
 * Create a status configuration from conditions array
 *
 * @param conditionType - The condition type to check (e.g., "Ready")
 */
export function createConditionStatusConfig(
  conditionType: string = "Ready"
): CrdPluginStatusConfig {
  return {
    getStatus: (resource) => {
      const conditions = getValueByPath(resource, "status.conditions") as
        | Array<{ type: string; status: string }>
        | undefined;

      if (!Array.isArray(conditions)) return null;

      const condition = conditions.find((c) => c.type === conditionType);
      if (!condition) return null;

      return condition.status === "True" ? "Ready" : "NotReady";
    },
    getVariant: (status) => {
      const normalized = status.toLowerCase();
      if (normalized === "ready" || normalized === "true") return "default";
      if (normalized === "notready" || normalized === "false") return "destructive";
      return "secondary";
    },
  };
}

// Re-export date utilities from main utils for convenience
export { formatDate, daysUntil } from "@/lib/utils";
