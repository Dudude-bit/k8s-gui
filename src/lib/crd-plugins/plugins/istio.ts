/**
 * Istio CRD Plugin
 *
 * Provides enhanced UI for Istio service mesh CRDs:
 * - VirtualService
 * - DestinationRule
 * - Gateway
 * - ServiceEntry
 * - Sidecar
 * - AuthorizationPolicy
 * - PeerAuthentication
 * - RequestAuthentication
 */

import { Network } from "lucide-react";
import type { CrdPlugin, CrdPluginColumn } from "../types";
import { getValueByPath } from "../utils";

/**
 * Columns for VirtualService list
 */
const virtualServiceColumns: CrdPluginColumn[] = [
  {
    id: "hosts",
    header: "Hosts",
    accessor: (resource) => {
      const hosts = getValueByPath(resource, "spec.hosts") as string[] | undefined;
      return hosts ?? [];
    },
    cell: (value) => {
      if (!Array.isArray(value) || value.length === 0) return "-";
      if (value.length === 1) return String(value[0]);
      return `${value[0]} +${value.length - 1}`;
    },
    width: 200,
    sortable: false,
  },
  {
    id: "gateways",
    header: "Gateways",
    accessor: (resource) => {
      const gateways = getValueByPath(resource, "spec.gateways") as string[] | undefined;
      return gateways ?? [];
    },
    cell: (value) => {
      if (!Array.isArray(value) || value.length === 0) return "mesh";
      return value.join(", ");
    },
    width: 150,
    sortable: false,
  },
  {
    id: "httpRoutes",
    header: "HTTP Routes",
    accessor: (resource) => {
      const http = getValueByPath(resource, "spec.http") as unknown[] | undefined;
      return http?.length ?? 0;
    },
    cell: (value) => (typeof value === "number" && value > 0 ? `${value}` : "-"),
    width: 100,
    sortable: true,
  },
  {
    id: "tcpRoutes",
    header: "TCP Routes",
    accessor: (resource) => {
      const tcp = getValueByPath(resource, "spec.tcp") as unknown[] | undefined;
      return tcp?.length ?? 0;
    },
    cell: (value) => (typeof value === "number" && value > 0 ? `${value}` : "-"),
    width: 100,
    sortable: true,
  },
  {
    id: "destinations",
    header: "Destinations",
    accessor: (resource) => {
      const http = getValueByPath(resource, "spec.http") as Array<{
        route?: Array<{ destination?: { host: string } }>;
      }> | undefined;

      if (!http) return [];

      const destinations = new Set<string>();
      for (const route of http) {
        if (route.route) {
          for (const r of route.route) {
            if (r.destination?.host) {
              destinations.add(r.destination.host);
            }
          }
        }
      }
      return Array.from(destinations);
    },
    cell: (value) => {
      if (!Array.isArray(value) || value.length === 0) return "-";
      if (value.length === 1) return String(value[0]);
      return `${value.length} services`;
    },
    width: 180,
    sortable: false,
  },
];

/**
 * Columns for DestinationRule list
 */
const destinationRuleColumns: CrdPluginColumn[] = [
  {
    id: "host",
    header: "Host",
    accessor: (resource) => getValueByPath(resource, "spec.host"),
    cell: (value) => String(value ?? "-"),
    width: 200,
    sortable: true,
  },
  {
    id: "trafficPolicy",
    header: "Traffic Policy",
    accessor: (resource) => {
      const policy = getValueByPath(resource, "spec.trafficPolicy") as Record<string, unknown> | undefined;
      if (!policy) return "None";

      const features: string[] = [];
      if (policy.connectionPool) features.push("ConnectionPool");
      if (policy.loadBalancer) features.push("LoadBalancer");
      if (policy.outlierDetection) features.push("OutlierDetection");
      if (policy.tls) features.push("TLS");

      return features.length > 0 ? features.join(", ") : "Default";
    },
    cell: (value) => String(value ?? "-"),
    width: 200,
    sortable: false,
  },
  {
    id: "subsets",
    header: "Subsets",
    accessor: (resource) => {
      const subsets = getValueByPath(resource, "spec.subsets") as Array<{ name: string }> | undefined;
      return subsets?.map((s) => s.name) ?? [];
    },
    cell: (value) => {
      if (!Array.isArray(value) || value.length === 0) return "-";
      return value.join(", ");
    },
    width: 150,
    sortable: false,
  },
  {
    id: "exportTo",
    header: "Export To",
    accessor: (resource) => {
      const exportTo = getValueByPath(resource, "spec.exportTo") as string[] | undefined;
      return exportTo ?? ["*"];
    },
    cell: (value) => {
      if (!Array.isArray(value)) return "*";
      if (value.includes("*")) return "All namespaces";
      if (value.includes(".")) return "Same namespace";
      return value.join(", ");
    },
    width: 120,
    sortable: false,
  },
];

/**
 * Columns for Gateway list
 */
const gatewayColumns: CrdPluginColumn[] = [
  {
    id: "selector",
    header: "Selector",
    accessor: (resource) => {
      const selector = getValueByPath(resource, "spec.selector") as Record<string, string> | undefined;
      if (!selector) return null;

      // Common pattern: istio: ingressgateway
      if (selector.istio) return `istio=${selector.istio}`;

      return Object.entries(selector)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
    },
    cell: (value) => String(value ?? "-"),
    width: 180,
    sortable: false,
  },
  {
    id: "servers",
    header: "Servers",
    accessor: (resource) => {
      const servers = getValueByPath(resource, "spec.servers") as Array<{
        port?: { number?: number; protocol?: string };
        hosts?: string[];
      }> | undefined;

      if (!servers) return [];

      return servers.map((s) => {
        const port = s.port?.number ?? "?";
        const protocol = s.port?.protocol ?? "HTTP";
        const hosts = s.hosts?.join(", ") ?? "*";
        return `${protocol}:${port} → ${hosts}`;
      });
    },
    cell: (value) => {
      if (!Array.isArray(value) || value.length === 0) return "-";
      if (value.length === 1) return String(value[0]);
      return `${value.length} servers`;
    },
    width: 250,
    sortable: false,
  },
  {
    id: "tlsEnabled",
    header: "TLS",
    accessor: (resource) => {
      const servers = getValueByPath(resource, "spec.servers") as Array<{
        tls?: { mode?: string };
      }> | undefined;

      if (!servers) return false;
      return servers.some((s) => s.tls && s.tls.mode !== "PASSTHROUGH");
    },
    cell: (value) => (value ? "Yes" : "No"),
    width: 80,
    sortable: true,
  },
];

/**
 * Columns for ServiceEntry list
 */
const serviceEntryColumns: CrdPluginColumn[] = [
  {
    id: "hosts",
    header: "Hosts",
    accessor: (resource) => {
      const hosts = getValueByPath(resource, "spec.hosts") as string[] | undefined;
      return hosts ?? [];
    },
    cell: (value) => {
      if (!Array.isArray(value) || value.length === 0) return "-";
      if (value.length === 1) return String(value[0]);
      return `${value[0]} +${value.length - 1}`;
    },
    width: 200,
    sortable: false,
  },
  {
    id: "location",
    header: "Location",
    accessor: (resource) => getValueByPath(resource, "spec.location"),
    cell: (value) => String(value ?? "MESH_EXTERNAL"),
    width: 130,
    sortable: true,
  },
  {
    id: "resolution",
    header: "Resolution",
    accessor: (resource) => getValueByPath(resource, "spec.resolution"),
    cell: (value) => String(value ?? "NONE"),
    width: 100,
    sortable: true,
  },
  {
    id: "ports",
    header: "Ports",
    accessor: (resource) => {
      const ports = getValueByPath(resource, "spec.ports") as Array<{
        number?: number;
        protocol?: string;
      }> | undefined;

      if (!ports) return [];
      return ports.map((p) => `${p.protocol ?? "TCP"}:${p.number ?? "?"}`);
    },
    cell: (value) => {
      if (!Array.isArray(value) || value.length === 0) return "-";
      return value.join(", ");
    },
    width: 150,
    sortable: false,
  },
  {
    id: "endpoints",
    header: "Endpoints",
    accessor: (resource) => {
      const endpoints = getValueByPath(resource, "spec.endpoints") as unknown[] | undefined;
      return endpoints?.length ?? 0;
    },
    cell: (value) => (typeof value === "number" && value > 0 ? `${value}` : "-"),
    width: 100,
    sortable: true,
  },
];

/**
 * Columns for AuthorizationPolicy list
 */
const authorizationPolicyColumns: CrdPluginColumn[] = [
  {
    id: "action",
    header: "Action",
    accessor: (resource) => getValueByPath(resource, "spec.action"),
    cell: (value) => String(value ?? "ALLOW"),
    width: 100,
    sortable: true,
  },
  {
    id: "selector",
    header: "Selector",
    accessor: (resource) => {
      const selector = getValueByPath(resource, "spec.selector.matchLabels") as Record<string, string> | undefined;
      if (!selector) return "All workloads";

      return Object.entries(selector)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
    },
    cell: (value) => String(value ?? "-"),
    width: 180,
    sortable: false,
  },
  {
    id: "rules",
    header: "Rules",
    accessor: (resource) => {
      const rules = getValueByPath(resource, "spec.rules") as unknown[] | undefined;
      return rules?.length ?? 0;
    },
    cell: (value) => (typeof value === "number" && value > 0 ? `${value} rules` : "No rules"),
    width: 100,
    sortable: true,
  },
];

/**
 * Main Istio plugin
 *
 * Matches all networking.istio.io and security.istio.io resources
 */
export const istioPlugin: CrdPlugin = {
  id: "istio",
  name: "Istio",
  description: "Enhanced UI for Istio service mesh resources",
  icon: Network,
  color: "#466BB0", // Istio blue

  // Match Istio networking and security API groups
  matches: (group) => {
    const normalizedGroup = group.toLowerCase();
    return (
      normalizedGroup === "networking.istio.io" ||
      normalizedGroup === "security.istio.io" ||
      normalizedGroup === "telemetry.istio.io"
    );
  },

  priority: 100,

  // Default to VirtualService columns
  columns: virtualServiceColumns,

  // Istio resources typically don't have status conditions
  status: {
    getStatus: () => null,
    getVariant: () => "outline",
  },
};

/**
 * Get columns based on the specific Istio kind
 */
export function getIstioColumns(kind: string): CrdPluginColumn[] {
  switch (kind.toLowerCase()) {
    case "virtualservice":
      return virtualServiceColumns;
    case "destinationrule":
      return destinationRuleColumns;
    case "gateway":
      return gatewayColumns;
    case "serviceentry":
      return serviceEntryColumns;
    case "authorizationpolicy":
    case "peerauthentication":
    case "requestauthentication":
      return authorizationPolicyColumns;
    default:
      return virtualServiceColumns;
  }
}

export default istioPlugin;
