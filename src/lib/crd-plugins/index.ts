/**
 * CRD Plugin System
 *
 * This module provides an extensible plugin architecture for customizing
 * the UI of specific Custom Resource Definitions (CRDs).
 *
 * ## Quick Start
 *
 * 1. Create a plugin file (e.g., `src/lib/crd-plugins/plugins/my-plugin.ts`):
 *
 * ```ts
 * import { CrdPlugin, matchByGroup, createColumn, createConditionStatusConfig } from "@/lib/crd-plugins";
 *
 * export const myPlugin: CrdPlugin = {
 *   id: "my-plugin",
 *   name: "My Custom Plugin",
 *   matches: matchByGroup("my-group.io"),
 *   columns: [
 *     createColumn("status", "Status", "status.phase"),
 *   ],
 *   status: createConditionStatusConfig("Ready"),
 * };
 * ```
 *
 * 2. Register the plugin in your app initialization:
 *
 * ```ts
 * import { registerPlugin } from "@/lib/crd-plugins";
 * import { myPlugin } from "@/lib/crd-plugins/plugins/my-plugin";
 *
 * registerPlugin(myPlugin);
 * ```
 *
 * 3. Use hooks in components to get plugin-enhanced UI:
 *
 * ```tsx
 * import { usePlugin, usePluginComponents } from "@/lib/crd-plugins";
 *
 * function MyComponent({ group, kind, plural }) {
 *   const plugin = usePlugin(group, kind, plural);
 *   const { ListComponent, DetailComponent } = usePluginComponents(group, kind, plural);
 *
 *   if (ListComponent) {
 *     return <ListComponent {...props} />;
 *   }
 *   // ... fallback to generic UI
 * }
 * ```
 *
 * ## Plugin Features
 *
 * - **Custom List Component**: Completely override the list view
 * - **Custom Detail Component**: Completely override the detail view
 * - **Custom Columns**: Add columns to the default list view
 * - **Custom Tabs**: Add tabs to the default detail view
 * - **Status Configuration**: Define how to extract and display status
 * - **Custom Actions**: Add action buttons to the UI
 * - **Data Transformers**: Transform data before rendering
 *
 * @module crd-plugins
 */

// Types
export type {
  CrdPlugin,
  CrdPluginColumn,
  CrdPluginTab,
  CrdPluginAction,
  CrdPluginStatusConfig,
  CrdPluginListProps,
  CrdPluginDetailProps,
  PluginRegistrationOptions,
  PluginMatch,
} from "./types";

// Registry functions
export {
  registerPlugin,
  registerPlugins,
  unregisterPlugin,
  getPluginForCrd,
  getPluginById,
  getAllPlugins,
  hasPluginForCrd,
  clearPlugins,
} from "./registry";

// React hooks
export {
  usePlugin,
  usePluginByCrdName,
  useAllPlugins,
  useHasPlugin,
  usePluginComponents,
} from "./hooks";

// Utility functions for creating plugins
export {
  matchByGroup,
  matchByGroupAndKind,
  matchMultiple,
  matchByPattern,
  getValueByPath,
  createColumn,
  createStatusConfig,
  createConditionStatusConfig,
  formatDate,
  daysUntil,
} from "./utils";
