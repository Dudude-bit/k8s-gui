/**
 * Flux Helm CRD Plugin
 *
 * Provides enhanced UI for Flux CD Helm-related CRDs:
 * - HelmRelease (helm.toolkit.fluxcd.io)
 * - HelmRepository (source.toolkit.fluxcd.io)
 * - HelmChart (source.toolkit.fluxcd.io)
 */

import { Package } from "lucide-react";
import type { CrdPlugin, CrdPluginColumn, CrdPluginStatusConfig } from "../types";
import { matchMultiple, getValueByPath } from "../utils";

/**
 * Status configuration for Flux resources (uses standard conditions)
 */
const fluxStatusConfig: CrdPluginStatusConfig = {
  getStatus: (resource) => {
    const conditions = getValueByPath(resource, "status.conditions") as
      | Array<{ type: string; status: string; reason?: string }>
      | undefined;

    if (!Array.isArray(conditions)) return null;

    // Check for Ready condition
    const readyCondition = conditions.find((c) => c.type === "Ready");
    if (readyCondition) {
      if (readyCondition.status === "True") return "Ready";
      if (readyCondition.reason === "Progressing") return "Progressing";
      return "NotReady";
    }

    // Check for Stalled condition
    const stalledCondition = conditions.find((c) => c.type === "Stalled");
    if (stalledCondition?.status === "True") return "Stalled";

    return "Unknown";
  },
  getVariant: (status) => {
    switch (status.toLowerCase()) {
      case "ready":
        return "default";
      case "progressing":
      case "reconciling":
        return "secondary";
      case "notready":
      case "stalled":
      case "failed":
        return "destructive";
      default:
        return "outline";
    }
  },
};

/**
 * Columns for HelmRelease list
 */
const helmReleaseColumns: CrdPluginColumn[] = [
  {
    id: "ready",
    header: "Ready",
    accessor: (resource) => {
      const conditions = getValueByPath(resource, "status.conditions") as
        | Array<{ type: string; status: string; reason?: string }>
        | undefined;

      if (!Array.isArray(conditions)) return "Unknown";

      const readyCondition = conditions.find((c) => c.type === "Ready");
      if (!readyCondition) return "Unknown";

      if (readyCondition.status === "True") return "True";
      if (readyCondition.reason === "Progressing") return "Progressing";
      return "False";
    },
    cell: (value) => String(value ?? "-"),
    width: 100,
    sortable: true,
  },
  {
    id: "chart",
    header: "Chart",
    accessor: (resource) => {
      const chartSpec = getValueByPath(resource, "spec.chart.spec") as {
        chart?: string;
        sourceRef?: { name: string };
      } | undefined;

      return chartSpec?.chart ?? "-";
    },
    cell: (value) => String(value ?? "-"),
    width: 150,
    sortable: true,
  },
  {
    id: "version",
    header: "Version",
    accessor: (resource) => {
      // Try to get installed version from status first
      const lastAppliedRevision = getValueByPath(resource, "status.lastAppliedRevision") as string | undefined;
      if (lastAppliedRevision) return lastAppliedRevision;

      // Fall back to spec version
      const chartSpec = getValueByPath(resource, "spec.chart.spec") as {
        version?: string;
      } | undefined;

      return chartSpec?.version ?? "*";
    },
    cell: (value) => String(value ?? "-"),
    width: 100,
    sortable: true,
  },
  {
    id: "sourceRef",
    header: "Source",
    accessor: (resource) => {
      const chartSpec = getValueByPath(resource, "spec.chart.spec") as {
        sourceRef?: { kind?: string; name: string };
      } | undefined;

      if (!chartSpec?.sourceRef) return "-";
      const kind = chartSpec.sourceRef.kind ?? "HelmRepository";
      return `${kind}/${chartSpec.sourceRef.name}`;
    },
    cell: (value) => String(value ?? "-"),
    width: 180,
    sortable: false,
  },
  {
    id: "targetNamespace",
    header: "Target NS",
    accessor: (resource) => getValueByPath(resource, "spec.targetNamespace"),
    cell: (value) => String(value ?? "(same)"),
    width: 120,
    sortable: true,
  },
  {
    id: "suspended",
    header: "Suspended",
    accessor: (resource) => getValueByPath(resource, "spec.suspend") === true,
    cell: (value) => (value ? "Yes" : "No"),
    width: 90,
    sortable: true,
  },
];

/**
 * Columns for HelmRepository list
 */
const helmRepositoryColumns: CrdPluginColumn[] = [
  {
    id: "ready",
    header: "Ready",
    accessor: (resource) => {
      const conditions = getValueByPath(resource, "status.conditions") as
        | Array<{ type: string; status: string }>
        | undefined;

      if (!Array.isArray(conditions)) return "Unknown";

      const readyCondition = conditions.find((c) => c.type === "Ready");
      return readyCondition?.status === "True" ? "True" : "False";
    },
    cell: (value) => String(value ?? "-"),
    width: 80,
    sortable: true,
  },
  {
    id: "url",
    header: "URL",
    accessor: (resource) => getValueByPath(resource, "spec.url"),
    cell: (value) => {
      if (!value) return "-";
      // Truncate long URLs
      const url = String(value);
      if (url.length > 50) {
        return url.substring(0, 47) + "...";
      }
      return url;
    },
    width: 300,
    sortable: false,
  },
  {
    id: "type",
    header: "Type",
    accessor: (resource) => {
      const repoType = getValueByPath(resource, "spec.type") as string | undefined;
      return repoType ?? "default";
    },
    cell: (value) => String(value ?? "-"),
    width: 100,
    sortable: true,
  },
  {
    id: "interval",
    header: "Interval",
    accessor: (resource) => getValueByPath(resource, "spec.interval"),
    cell: (value) => String(value ?? "-"),
    width: 100,
    sortable: false,
  },
  {
    id: "artifact",
    header: "Last Fetched",
    accessor: (resource) => getValueByPath(resource, "status.artifact.lastUpdateTime"),
    cell: (value) => {
      if (!value) return "-";
      const date = new Date(String(value));
      if (isNaN(date.getTime())) return "-";
      return date.toLocaleString();
    },
    width: 180,
    sortable: true,
  },
];

/**
 * Columns for HelmChart list
 */
const helmChartColumns: CrdPluginColumn[] = [
  {
    id: "ready",
    header: "Ready",
    accessor: (resource) => {
      const conditions = getValueByPath(resource, "status.conditions") as
        | Array<{ type: string; status: string }>
        | undefined;

      if (!Array.isArray(conditions)) return "Unknown";

      const readyCondition = conditions.find((c) => c.type === "Ready");
      return readyCondition?.status === "True" ? "True" : "False";
    },
    cell: (value) => String(value ?? "-"),
    width: 80,
    sortable: true,
  },
  {
    id: "chart",
    header: "Chart",
    accessor: (resource) => getValueByPath(resource, "spec.chart"),
    cell: (value) => String(value ?? "-"),
    width: 150,
    sortable: true,
  },
  {
    id: "version",
    header: "Version",
    accessor: (resource) => {
      // Try artifact version first (actual fetched version)
      const artifactRevision = getValueByPath(resource, "status.artifact.revision") as string | undefined;
      if (artifactRevision) return artifactRevision;

      // Fall back to spec version constraint
      return getValueByPath(resource, "spec.version") ?? "*";
    },
    cell: (value) => String(value ?? "-"),
    width: 120,
    sortable: true,
  },
  {
    id: "sourceRef",
    header: "Source",
    accessor: (resource) => {
      const sourceRef = getValueByPath(resource, "spec.sourceRef") as {
        kind?: string;
        name: string;
      } | undefined;

      if (!sourceRef) return "-";
      return `${sourceRef.kind ?? "HelmRepository"}/${sourceRef.name}`;
    },
    cell: (value) => String(value ?? "-"),
    width: 200,
    sortable: false,
  },
  {
    id: "interval",
    header: "Interval",
    accessor: (resource) => getValueByPath(resource, "spec.interval"),
    cell: (value) => String(value ?? "-"),
    width: 100,
    sortable: false,
  },
];

/**
 * Main Flux Helm plugin
 *
 * Matches HelmRelease, HelmRepository, and HelmChart from Flux
 */
export const fluxHelmPlugin: CrdPlugin = {
  id: "flux-helm",
  name: "Flux Helm",
  description: "Enhanced UI for Flux CD Helm resources",
  icon: Package,
  color: "#5166D9", // Flux purple

  // Match Flux Helm-related API groups
  matches: matchMultiple([
    ["helm.toolkit.fluxcd.io"],
    ["source.toolkit.fluxcd.io", "HelmRepository"],
    ["source.toolkit.fluxcd.io", "HelmChart"],
  ]),

  priority: 100,

  // Default to HelmRelease columns
  columns: helmReleaseColumns,

  status: fluxStatusConfig,

  // Add computed fields for easier filtering
  transformListItem: (item) => {
    const conditions = getValueByPath(item, "status.conditions") as
      | Array<{ type: string; status: string; reason?: string }>
      | undefined;

    const readyCondition = conditions?.find((c) => c.type === "Ready");
    const isSuspended = getValueByPath(item, "spec.suspend") === true;

    return {
      ...item,
      _isReady: readyCondition?.status === "True",
      _isSuspended: isSuspended,
      _statusReason: readyCondition?.reason,
    };
  },
};

/**
 * Get columns based on the specific Flux Helm kind
 */
export function getFluxHelmColumns(kind: string): CrdPluginColumn[] {
  switch (kind.toLowerCase()) {
    case "helmrelease":
      return helmReleaseColumns;
    case "helmrepository":
      return helmRepositoryColumns;
    case "helmchart":
      return helmChartColumns;
    default:
      return helmReleaseColumns;
  }
}

export default fluxHelmPlugin;
