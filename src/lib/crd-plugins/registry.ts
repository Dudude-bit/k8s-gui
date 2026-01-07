/**
 * CRD Plugin Registry
 *
 * Central registry for CRD plugins. Plugins are registered at app startup
 * and looked up when rendering CRD-related components.
 *
 * Usage:
 *   // Register a plugin
 *   registerPlugin(certManagerPlugin);
 *
 *   // Find plugin for a CRD
 *   const plugin = getPluginForCrd("cert-manager.io", "Certificate", "certificates");
 */

import type { CrdPlugin, PluginRegistrationOptions, PluginMatch } from "./types";

// Internal plugin storage
const plugins: Map<string, CrdPlugin> = new Map();

// Sorted plugin list for matching (by priority, descending)
let sortedPlugins: CrdPlugin[] = [];

/**
 * Register a CRD plugin
 *
 * @param plugin - The plugin to register
 * @param options - Registration options
 * @throws Error if plugin with same ID exists and override is false
 */
export function registerPlugin(
  plugin: CrdPlugin,
  options: PluginRegistrationOptions = {}
): void {
  const { override = false } = options;

  if (plugins.has(plugin.id) && !override) {
    throw new Error(
      `Plugin with ID "${plugin.id}" is already registered. ` +
        `Use { override: true } to replace it.`
    );
  }

  plugins.set(plugin.id, plugin);
  rebuildSortedList();

  if (process.env.NODE_ENV === "development") {
    console.log(`[CRD Plugins] Registered plugin: ${plugin.id} (${plugin.name})`);
  }
}

/**
 * Register multiple CRD plugins at once
 *
 * @param pluginList - Array of plugins to register
 * @param options - Registration options (applied to all)
 */
export function registerPlugins(
  pluginList: CrdPlugin[],
  options: PluginRegistrationOptions = {}
): void {
  for (const plugin of pluginList) {
    registerPlugin(plugin, options);
  }
}

/**
 * Unregister a CRD plugin
 *
 * @param pluginId - The ID of the plugin to remove
 * @returns true if plugin was removed, false if not found
 */
export function unregisterPlugin(pluginId: string): boolean {
  const removed = plugins.delete(pluginId);
  if (removed) {
    rebuildSortedList();
    if (process.env.NODE_ENV === "development") {
      console.log(`[CRD Plugins] Unregistered plugin: ${pluginId}`);
    }
  }
  return removed;
}

/**
 * Get a plugin by its ID
 *
 * @param pluginId - The plugin ID
 * @returns The plugin or undefined
 */
export function getPlugin(pluginId: string): CrdPlugin | undefined {
  return plugins.get(pluginId);
}

/**
 * Get all registered plugins
 *
 * @returns Array of all registered plugins
 */
export function getAllPlugins(): CrdPlugin[] {
  return Array.from(plugins.values());
}

/**
 * Find the best matching plugin for a CRD
 *
 * @param group - API group (e.g., "cert-manager.io")
 * @param kind - Resource kind (e.g., "Certificate")
 * @param plural - Resource plural name (e.g., "certificates")
 * @returns The matching plugin or null
 */
export function getPluginForCrd(
  group: string,
  kind: string,
  plural: string
): CrdPlugin | null {
  for (const plugin of sortedPlugins) {
    if (plugin.matches(group, kind, plural)) {
      return plugin;
    }
  }
  return null;
}

/**
 * Find all matching plugins for a CRD (for debugging/testing)
 *
 * @param group - API group
 * @param kind - Resource kind
 * @param plural - Resource plural name
 * @returns Array of matching plugins with scores
 */
export function findAllMatchingPlugins(
  group: string,
  kind: string,
  plural: string
): PluginMatch[] {
  const matches: PluginMatch[] = [];

  for (const plugin of sortedPlugins) {
    if (plugin.matches(group, kind, plural)) {
      matches.push({
        plugin,
        score: plugin.priority ?? 0,
      });
    }
  }

  return matches;
}

/**
 * Check if a plugin exists for a CRD
 *
 * @param group - API group
 * @param kind - Resource kind
 * @param plural - Resource plural name
 * @returns true if a plugin handles this CRD
 */
export function hasPluginForCrd(
  group: string,
  kind: string,
  plural: string
): boolean {
  return getPluginForCrd(group, kind, plural) !== null;
}

/**
 * Get plugins grouped by category
 * Useful for displaying in settings/plugin management UI
 */
export function getPluginsByCategory(): Record<string, CrdPlugin[]> {
  const categories: Record<string, CrdPlugin[]> = {
    "Certificate Management": [],
    "Service Mesh": [],
    "GitOps": [],
    "Ingress": [],
    "Other": [],
  };

  for (const plugin of plugins.values()) {
    // Categorize based on plugin ID/name
    const id = plugin.id.toLowerCase();
    if (id.includes("cert") || id.includes("tls")) {
      categories["Certificate Management"].push(plugin);
    } else if (id.includes("istio") || id.includes("linkerd")) {
      categories["Service Mesh"].push(plugin);
    } else if (id.includes("flux") || id.includes("argo") || id.includes("helm")) {
      categories["GitOps"].push(plugin);
    } else if (id.includes("traefik") || id.includes("nginx") || id.includes("ingress")) {
      categories["Ingress"].push(plugin);
    } else {
      categories["Other"].push(plugin);
    }
  }

  // Remove empty categories
  return Object.fromEntries(
    Object.entries(categories).filter(([, plugins]) => plugins.length > 0)
  );
}

/**
 * Clear all registered plugins
 * Mainly useful for testing
 */
export function clearAllPlugins(): void {
  plugins.clear();
  sortedPlugins = [];
}

// Aliases for convenience
export const getPluginById = getPlugin;
export const clearPlugins = clearAllPlugins;

// Helper to rebuild the sorted plugin list
function rebuildSortedList(): void {
  sortedPlugins = Array.from(plugins.values()).sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
  );
}

// Export a hook for React components
export { usePlugin } from "./hooks";
