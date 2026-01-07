/**
 * Cert-Manager CRD Plugin
 *
 * Provides enhanced UI for cert-manager.io CRDs:
 * - Certificate
 * - Issuer
 * - ClusterIssuer
 * - CertificateRequest
 * - Order
 * - Challenge
 */

import { Shield } from "lucide-react";
import type { CrdPlugin, CrdPluginColumn, CrdPluginStatusConfig } from "../types";
import { matchByGroup, getValueByPath, daysUntil } from "../utils";

/**
 * Status configuration for Certificate resources
 */
const certificateStatusConfig: CrdPluginStatusConfig = {
  getStatus: (resource) => {
    const conditions = getValueByPath(resource, "status.conditions") as
      | Array<{ type: string; status: string }>
      | undefined;

    if (!Array.isArray(conditions)) return null;

    const readyCondition = conditions.find((c) => c.type === "Ready");
    if (!readyCondition) return null;

    return readyCondition.status === "True" ? "Ready" : "NotReady";
  },
  getVariant: (status) => {
    switch (status.toLowerCase()) {
      case "ready":
      case "true":
        return "default";
      case "notready":
      case "false":
        return "destructive";
      default:
        return "secondary";
    }
  },
};

/**
 * Columns for Certificate list
 */
const certificateColumns: CrdPluginColumn[] = [
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
    id: "secret",
    header: "Secret",
    accessor: (resource) => getValueByPath(resource, "spec.secretName"),
    cell: (value) => String(value ?? "-"),
    width: 150,
    sortable: true,
  },
  {
    id: "issuer",
    header: "Issuer",
    accessor: (resource) => {
      const issuerRef = getValueByPath(resource, "spec.issuerRef") as
        | { name: string; kind?: string }
        | undefined;

      if (!issuerRef) return null;
      return `${issuerRef.kind || "Issuer"}/${issuerRef.name}`;
    },
    cell: (value) => String(value ?? "-"),
    width: 180,
    sortable: true,
  },
  {
    id: "dnsNames",
    header: "DNS Names",
    accessor: (resource) => {
      const dnsNames = getValueByPath(resource, "spec.dnsNames") as string[] | undefined;
      return dnsNames?.length ?? 0;
    },
    cell: (value) => (typeof value === "number" ? `${value} names` : "-"),
    width: 100,
    sortable: true,
  },
  {
    id: "expiry",
    header: "Expires",
    accessor: (resource) => getValueByPath(resource, "status.notAfter"),
    cell: (value) => {
      if (!value) return "-";
      const days = daysUntil(value);
      if (days === null) return "-";
      if (days < 0) return "Expired";
      if (days === 0) return "Today";
      if (days === 1) return "Tomorrow";
      return `${days} days`;
    },
    width: 100,
    sortable: true,
  },
];

/**
 * Columns for Issuer/ClusterIssuer list
 */
const issuerColumns: CrdPluginColumn[] = [
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
    id: "type",
    header: "Type",
    accessor: (resource) => {
      const spec = getValueByPath(resource, "spec") as Record<string, unknown> | undefined;
      if (!spec) return "Unknown";

      // Detect issuer type based on spec fields
      if (spec.acme) return "ACME";
      if (spec.ca) return "CA";
      if (spec.selfSigned) return "SelfSigned";
      if (spec.vault) return "Vault";
      if (spec.venafi) return "Venafi";
      return "Unknown";
    },
    cell: (value) => String(value ?? "-"),
    width: 100,
    sortable: true,
  },
  {
    id: "server",
    header: "Server/Details",
    accessor: (resource) => {
      const spec = getValueByPath(resource, "spec") as Record<string, unknown> | undefined;
      if (!spec) return null;

      if (spec.acme) {
        const acme = spec.acme as { server?: string };
        if (acme.server?.includes("letsencrypt.org")) {
          return acme.server.includes("staging") ? "Let's Encrypt (Staging)" : "Let's Encrypt";
        }
        return acme.server ?? null;
      }
      if (spec.ca) {
        const ca = spec.ca as { secretName?: string };
        return `CA: ${ca.secretName ?? "unknown"}`;
      }
      if (spec.selfSigned) return "Self-Signed";
      if (spec.vault) {
        const vault = spec.vault as { server?: string };
        return vault.server ?? "Vault";
      }
      return null;
    },
    cell: (value) => String(value ?? "-"),
    width: 200,
    sortable: false,
  },
];

/**
 * Columns for CertificateRequest list
 */
const certificateRequestColumns: CrdPluginColumn[] = [
  {
    id: "ready",
    header: "Ready",
    accessor: (resource) => {
      const conditions = getValueByPath(resource, "status.conditions") as
        | Array<{ type: string; status: string }>
        | undefined;

      if (!Array.isArray(conditions)) return "Unknown";

      const readyCondition = conditions.find((c) => c.type === "Ready");
      const approved = conditions.find((c) => c.type === "Approved");
      const denied = conditions.find((c) => c.type === "Denied");

      if (denied?.status === "True") return "Denied";
      if (readyCondition?.status === "True") return "Ready";
      if (approved?.status === "True") return "Approved";
      return "Pending";
    },
    cell: (value) => String(value ?? "-"),
    width: 100,
    sortable: true,
  },
  {
    id: "issuer",
    header: "Issuer",
    accessor: (resource) => {
      const issuerRef = getValueByPath(resource, "spec.issuerRef") as
        | { name: string; kind?: string }
        | undefined;

      if (!issuerRef) return null;
      return `${issuerRef.kind || "Issuer"}/${issuerRef.name}`;
    },
    cell: (value) => String(value ?? "-"),
    width: 180,
    sortable: true,
  },
  {
    id: "requestor",
    header: "Requestor",
    accessor: (resource) => getValueByPath(resource, "spec.username"),
    cell: (value) => String(value ?? "-"),
    width: 150,
    sortable: true,
  },
];

/**
 * Main Cert-Manager plugin
 *
 * This plugin enhances the UI for all cert-manager.io resources
 */
export const certManagerPlugin: CrdPlugin = {
  id: "cert-manager",
  name: "Cert-Manager",
  description: "Enhanced UI for cert-manager.io custom resources",
  icon: Shield,
  color: "#326CE5", // Kubernetes blue

  // Match all cert-manager.io resources
  matches: matchByGroup("cert-manager.io"),

  // Higher priority to override generic handling
  priority: 100,

  // Dynamic columns based on kind
  columns: certificateColumns, // Default to Certificate columns

  // Status configuration
  status: certificateStatusConfig,

  // Transform list items to add computed fields
  transformListItem: (item) => {
    const conditions = getValueByPath(item, "status.conditions") as
      | Array<{ type: string; status: string; message?: string }>
      | undefined;

    const readyCondition = conditions?.find((c) => c.type === "Ready");
    const notAfter = getValueByPath(item, "status.notAfter") as string | undefined;

    return {
      ...item,
      _isReady: readyCondition?.status === "True",
      _readyMessage: readyCondition?.message,
      _expiresIn: notAfter ? daysUntil(notAfter) : null,
    };
  },
};

/**
 * Get columns based on the specific cert-manager kind
 */
export function getCertManagerColumns(kind: string): CrdPluginColumn[] {
  switch (kind.toLowerCase()) {
    case "certificate":
      return certificateColumns;
    case "issuer":
    case "clusterissuer":
      return issuerColumns;
    case "certificaterequest":
      return certificateRequestColumns;
    default:
      return certificateColumns;
  }
}

export default certManagerPlugin;
