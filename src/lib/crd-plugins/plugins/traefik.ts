/**
 * Traefik CRD Plugin
 *
 * Provides enhanced UI for traefik.io CRDs:
 * - IngressRoute
 * - IngressRouteTCP
 * - IngressRouteUDP
 * - Middleware
 * - MiddlewareTCP
 * - TLSOption
 * - TLSStore
 * - ServersTransport
 * - TraefikService
 */

import { Route } from "lucide-react";
import type { CrdPlugin, CrdPluginColumn } from "../types";
import { matchByPattern, getValueByPath } from "../utils";

/**
 * Columns for IngressRoute list
 */
const ingressRouteColumns: CrdPluginColumn[] = [
  {
    id: "entryPoints",
    header: "Entry Points",
    accessor: (resource) => {
      const entryPoints = getValueByPath(resource, "spec.entryPoints") as string[] | undefined;
      return entryPoints ?? [];
    },
    cell: (value) => {
      if (!Array.isArray(value) || value.length === 0) return "-";
      return value.join(", ");
    },
    width: 120,
    sortable: false,
  },
  {
    id: "hosts",
    header: "Hosts",
    accessor: (resource) => {
      const routes = getValueByPath(resource, "spec.routes") as Array<{ match?: string }> | undefined;
      if (!routes) return [];

      // Extract hosts from match rules like "Host(`example.com`)"
      const hosts = new Set<string>();
      for (const route of routes) {
        if (route.match) {
          const hostMatches = route.match.matchAll(/Host\(`([^`]+)`\)/g);
          for (const match of hostMatches) {
            hosts.add(match[1]);
          }
        }
      }
      return Array.from(hosts);
    },
    cell: (value) => {
      if (!Array.isArray(value) || value.length === 0) return "-";
      if (value.length === 1) return value[0];
      return `${value[0]} +${value.length - 1}`;
    },
    width: 180,
    sortable: false,
  },
  {
    id: "services",
    header: "Services",
    accessor: (resource) => {
      const routes = getValueByPath(resource, "spec.routes") as Array<{
        services?: Array<{ name: string; port?: number }>;
      }> | undefined;

      if (!routes) return [];

      const services = new Set<string>();
      for (const route of routes) {
        if (route.services) {
          for (const svc of route.services) {
            services.add(svc.port ? `${svc.name}:${svc.port}` : svc.name);
          }
        }
      }
      return Array.from(services);
    },
    cell: (value) => {
      if (!Array.isArray(value) || value.length === 0) return "-";
      if (value.length === 1) return value[0];
      return `${value.length} services`;
    },
    width: 150,
    sortable: false,
  },
  {
    id: "middlewares",
    header: "Middlewares",
    accessor: (resource) => {
      const routes = getValueByPath(resource, "spec.routes") as Array<{
        middlewares?: Array<{ name: string }>;
      }> | undefined;

      if (!routes) return 0;

      const middlewares = new Set<string>();
      for (const route of routes) {
        if (route.middlewares) {
          for (const mw of route.middlewares) {
            middlewares.add(mw.name);
          }
        }
      }
      return middlewares.size;
    },
    cell: (value) => (typeof value === "number" && value > 0 ? `${value}` : "-"),
    width: 100,
    sortable: true,
  },
  {
    id: "tls",
    header: "TLS",
    accessor: (resource) => {
      const tls = getValueByPath(resource, "spec.tls") as {
        secretName?: string;
        certResolver?: string;
      } | undefined;

      if (!tls) return "No";
      if (tls.certResolver) return `Resolver: ${tls.certResolver}`;
      if (tls.secretName) return `Secret: ${tls.secretName}`;
      return "Yes";
    },
    cell: (value) => String(value ?? "-"),
    width: 150,
    sortable: false,
  },
];

/**
 * Columns for Middleware list
 */
const middlewareColumns: CrdPluginColumn[] = [
  {
    id: "type",
    header: "Type",
    accessor: (resource) => {
      const spec = getValueByPath(resource, "spec") as Record<string, unknown> | undefined;
      if (!spec) return "Unknown";

      // Detect middleware type based on spec fields
      const types = [
        "addPrefix",
        "basicAuth",
        "buffering",
        "chain",
        "circuitBreaker",
        "compress",
        "contentType",
        "digestAuth",
        "errors",
        "forwardAuth",
        "headers",
        "inFlightReq",
        "ipWhiteList",
        "ipAllowList",
        "passTLSClientCert",
        "plugin",
        "rateLimit",
        "redirectRegex",
        "redirectScheme",
        "replacePath",
        "replacePathRegex",
        "retry",
        "stripPrefix",
        "stripPrefixRegex",
      ];

      for (const type of types) {
        if (spec[type]) return type;
      }
      return "Unknown";
    },
    cell: (value) => String(value ?? "-"),
    width: 150,
    sortable: true,
  },
  {
    id: "details",
    header: "Details",
    accessor: (resource) => {
      const spec = getValueByPath(resource, "spec") as Record<string, unknown> | undefined;
      if (!spec) return null;

      // Extract relevant details based on type
      if (spec.stripPrefix) {
        const stripPrefix = spec.stripPrefix as { prefixes?: string[] };
        return stripPrefix.prefixes?.join(", ");
      }
      if (spec.addPrefix) {
        const addPrefix = spec.addPrefix as { prefix?: string };
        return addPrefix.prefix;
      }
      if (spec.rateLimit) {
        const rateLimit = spec.rateLimit as { average?: number; burst?: number };
        return `${rateLimit.average ?? 0}/s, burst: ${rateLimit.burst ?? 0}`;
      }
      if (spec.redirectScheme) {
        const redirect = spec.redirectScheme as { scheme?: string; permanent?: boolean };
        return `→ ${redirect.scheme ?? "https"}${redirect.permanent ? " (301)" : " (302)"}`;
      }
      if (spec.basicAuth || spec.digestAuth || spec.forwardAuth) {
        return "Auth enabled";
      }
      if (spec.headers) {
        return "Custom headers";
      }
      if (spec.chain) {
        const chain = spec.chain as { middlewares?: Array<{ name: string }> };
        return chain.middlewares?.map((m) => m.name).join(" → ");
      }

      return null;
    },
    cell: (value) => String(value ?? "-"),
    width: 250,
    sortable: false,
  },
];

/**
 * Columns for TLSOption list
 */
const tlsOptionColumns: CrdPluginColumn[] = [
  {
    id: "minVersion",
    header: "Min Version",
    accessor: (resource) => getValueByPath(resource, "spec.minVersion"),
    cell: (value) => String(value ?? "Default"),
    width: 120,
    sortable: true,
  },
  {
    id: "maxVersion",
    header: "Max Version",
    accessor: (resource) => getValueByPath(resource, "spec.maxVersion"),
    cell: (value) => String(value ?? "Default"),
    width: 120,
    sortable: true,
  },
  {
    id: "cipherSuites",
    header: "Cipher Suites",
    accessor: (resource) => {
      const cipherSuites = getValueByPath(resource, "spec.cipherSuites") as string[] | undefined;
      return cipherSuites?.length ?? 0;
    },
    cell: (value) => (typeof value === "number" && value > 0 ? `${value} suites` : "Default"),
    width: 120,
    sortable: true,
  },
  {
    id: "sniStrict",
    header: "SNI Strict",
    accessor: (resource) => getValueByPath(resource, "spec.sniStrict"),
    cell: (value) => (value === true ? "Yes" : "No"),
    width: 100,
    sortable: true,
  },
];

/**
 * Main Traefik plugin
 *
 * Matches both traefik.io and traefik.containo.us (legacy) API groups
 */
export const traefikPlugin: CrdPlugin = {
  id: "traefik",
  name: "Traefik",
  description: "Enhanced UI for Traefik proxy custom resources",
  icon: Route,
  color: "#24A1C1", // Traefik teal

  // Match both traefik.io and traefik.containo.us (legacy)
  matches: matchByPattern(/^traefik\.(io|containo\.us)$/),

  // Higher priority
  priority: 100,

  // Default columns for IngressRoute
  columns: ingressRouteColumns,

  // Status based on conditions (if present)
  status: {
    getStatus: () => null, // Traefik resources typically don't have status
    getVariant: () => "outline",
  },
};

/**
 * Get columns based on the specific Traefik kind
 */
export function getTraefikColumns(kind: string): CrdPluginColumn[] {
  const kindLower = kind.toLowerCase();

  if (kindLower.includes("ingressroute")) {
    return ingressRouteColumns;
  }
  if (kindLower.includes("middleware")) {
    return middlewareColumns;
  }
  if (kindLower.includes("tlsoption")) {
    return tlsOptionColumns;
  }

  return ingressRouteColumns; // Default
}

export default traefikPlugin;
