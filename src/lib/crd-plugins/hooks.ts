/**
 * React hooks for CRD Plugin system
 */

import { useMemo } from "react";
import type { CrdPlugin } from "./types";
import { getPluginForCrd, getAllPlugins } from "./registry";

/**
 * Hook to get the plugin for a specific CRD
 *
 * @param group - API group (e.g., "cert-manager.io")
 * @param kind - Resource kind (e.g., "Certificate")
 * @param plural - Resource plural name (e.g., "certificates")
 * @returns The matching plugin or null
 *
 * @example
 * ```tsx
 * const plugin = usePlugin("cert-manager.io", "Certificate", "certificates");
 * if (plugin?.ListComponent) {
 *   return <plugin.ListComponent {...props} />;
 * }
 * ```
 */
export function usePlugin(
  group: string,
  kind: string,
  plural: string
): CrdPlugin | null {
  return useMemo(
    () => getPluginForCrd(group, kind, plural),
    [group, kind, plural]
  );
}

/**
 * Hook to get the plugin for a CRD by its full name
 *
 * @param crdName - Full CRD name (e.g., "certificates.cert-manager.io")
 * @returns The matching plugin or null
 *
 * @example
 * ```tsx
 * const plugin = usePluginByCrdName("certificates.cert-manager.io");
 * ```
 */
export function usePluginByCrdName(crdName: string): CrdPlugin | null {
  return useMemo(() => {
    // Parse CRD name: plural.group (e.g., "certificates.cert-manager.io")
    const dotIndex = crdName.indexOf(".");
    if (dotIndex === -1) {
      // No group (core resources)
      return getPluginForCrd("", "", crdName);
    }

    const plural = crdName.substring(0, dotIndex);
    const group = crdName.substring(dotIndex + 1);

    // We don't have kind from CRD name, but plugins can match on group+plural
    return getPluginForCrd(group, "", plural);
  }, [crdName]);
}

/**
 * Hook to get all registered plugins
 *
 * @returns Array of all plugins
 *
 * @example
 * ```tsx
 * const plugins = useAllPlugins();
 * return (
 *   <ul>
 *     {plugins.map(p => <li key={p.id}>{p.name}</li>)}
 *   </ul>
 * );
 * ```
 */
export function useAllPlugins(): CrdPlugin[] {
  return useMemo(() => getAllPlugins(), []);
}

/**
 * Hook to check if a plugin exists for a CRD
 *
 * @param group - API group
 * @param kind - Resource kind
 * @param plural - Resource plural name
 * @returns true if a plugin handles this CRD
 */
export function useHasPlugin(
  group: string,
  kind: string,
  plural: string
): boolean {
  const plugin = usePlugin(group, kind, plural);
  return plugin !== null;
}

/**
 * Hook to get plugin components for a CRD
 * Returns the components or null if no plugin or no custom components
 *
 * @param group - API group
 * @param kind - Resource kind
 * @param plural - Resource plural name
 */
export function usePluginComponents(
  group: string,
  kind: string,
  plural: string
) {
  const plugin = usePlugin(group, kind, plural);

  return useMemo(
    () => ({
      ListComponent: plugin?.ListComponent ?? null,
      DetailComponent: plugin?.DetailComponent ?? null,
      columns: plugin?.columns ?? [],
      tabs: plugin?.tabs ?? [],
      actions: plugin?.actions ?? [],
      status: plugin?.status ?? null,
      icon: plugin?.icon ?? null,
      color: plugin?.color ?? null,
    }),
    [plugin]
  );
}
