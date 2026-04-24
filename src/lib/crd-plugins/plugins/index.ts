/**
 * Built-in CRD Plugins
 *
 * This file exports all built-in plugins and provides a function
 * to register them all at once.
 */

import { registerPlugins } from "../registry";
import type { CrdPlugin } from "../types";

// Import built-in plugins
import { certManagerPlugin, getCertManagerColumns } from "./cert-manager";
import { traefikPlugin, getTraefikColumns } from "./traefik";
import { fluxHelmPlugin, getFluxHelmColumns } from "./flux-helm";
import { istioPlugin, getIstioColumns } from "./istio";

/**
 * All built-in plugins
 */
export const builtInPlugins: CrdPlugin[] = [
  certManagerPlugin,
  traefikPlugin,
  fluxHelmPlugin,
  istioPlugin,
];

/**
 * Register all built-in plugins
 *
 * Call this function during app initialization to enable
 * enhanced UI for popular CRDs.
 *
 * @example
 * ```ts
 * // In your App.tsx or main.tsx
 * import { registerBuiltInPlugins } from "@/lib/crd-plugins/plugins";
 *
 * registerBuiltInPlugins();
 * ```
 */
export function registerBuiltInPlugins(): void {
  registerPlugins(builtInPlugins);
}

/**
 * Get kind-specific columns for a plugin
 *
 * Some plugins provide different column sets for different resource kinds.
 * This helper function retrieves the appropriate columns based on the kind.
 *
 * @param pluginId - The plugin ID (e.g., "cert-manager", "istio")
 * @param kind - The resource kind (e.g., "Certificate", "VirtualService")
 * @returns Array of columns for the specific kind, or undefined if not available
 */
export function getKindSpecificColumns(pluginId: string, kind: string) {
  switch (pluginId) {
    case "cert-manager":
      return getCertManagerColumns(kind);
    case "traefik":
      return getTraefikColumns(kind);
    case "flux-helm":
      return getFluxHelmColumns(kind);
    case "istio":
      return getIstioColumns(kind);
    default:
      return undefined;
  }
}

// Re-export individual plugins for direct access
export { certManagerPlugin, getCertManagerColumns } from "./cert-manager";
export { traefikPlugin, getTraefikColumns } from "./traefik";
export { fluxHelmPlugin, getFluxHelmColumns } from "./flux-helm";
export { istioPlugin, getIstioColumns } from "./istio";
