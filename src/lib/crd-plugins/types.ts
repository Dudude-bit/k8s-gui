/**
 * CRD Plugin System Types
 *
 * This module defines the types for the extensible CRD plugin system.
 * Plugins can provide custom UI components for specific CRD types.
 */

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { CustomResourceInfo, CustomResourceDetailInfo, PrinterColumn } from "@/generated/types";

/**
 * Props passed to custom list components
 */
export interface CrdPluginListProps {
  /** Full CRD name (e.g., "certificates.cert-manager.io") */
  crdName: string;
  /** CRD kind (e.g., "Certificate") */
  crdKind: string;
  /** Whether the resource is namespaced or cluster-scoped */
  scope: "Namespaced" | "Cluster";
  /** Printer columns from CRD spec */
  printerColumns?: PrinterColumn[];
  /** If true, renders without header (for embedding) */
  embedded?: boolean;
}

/**
 * Props passed to custom detail components
 */
export interface CrdPluginDetailProps {
  /** The custom resource data */
  resource: CustomResourceDetailInfo;
  /** Full CRD name */
  crdName: string;
  /** CRD kind */
  crdKind: string;
  /** YAML representation of the resource */
  yaml?: string;
  /** Callback to refresh the resource */
  onRefresh: () => void;
  /** Callback to delete the resource */
  onDelete: () => void;
  /** Whether delete is in progress */
  isDeleting?: boolean;
}

/**
 * Props passed to custom list item renderers
 */
export interface CrdPluginListItemProps {
  /** The custom resource item */
  item: CustomResourceInfo;
  /** Full CRD name */
  crdName: string;
}

/**
 * Column definition for plugin-provided columns
 */
export interface CrdPluginColumn {
  /** Unique column ID */
  id: string;
  /** Column header text */
  header: string;
  /** Function to extract cell value from resource */
  accessor: (resource: CustomResourceInfo) => unknown;
  /** Optional cell renderer - if not provided, value is stringified */
  cell?: (value: unknown, resource?: CustomResourceInfo) => React.ReactNode;
  /** Column width hint */
  width?: number | string;
  /** Whether column is sortable */
  sortable?: boolean;
}

/**
 * Status badge configuration for a resource
 */
export interface CrdPluginStatusConfig {
  /** Function to determine status text */
  getStatus: (resource: CustomResourceInfo | CustomResourceDetailInfo) => string | null;
  /** Function to determine status variant */
  getVariant: (status: string) => "default" | "secondary" | "destructive" | "outline";
}

/**
 * Tab definition for detail page
 */
export interface CrdPluginTab {
  /** Unique tab ID */
  id: string;
  /** Tab label */
  label: string;
  /** Tab icon */
  icon?: LucideIcon;
  /** Tab content component */
  component: ComponentType<{ resource: CustomResourceDetailInfo; crdName: string }>;
}

/**
 * Quick action for list or detail views
 */
export interface CrdPluginAction {
  /** Unique action ID */
  id: string;
  /** Action label */
  label: string;
  /** Action icon */
  icon?: LucideIcon;
  /** Whether action is destructive */
  variant?: "default" | "destructive";
  /** Action handler */
  handler: (resource: CustomResourceInfo | CustomResourceDetailInfo) => void | Promise<void>;
  /** Whether action is available for this resource */
  isAvailable?: (resource: CustomResourceInfo | CustomResourceDetailInfo) => boolean;
}

/**
 * Main CRD Plugin definition
 *
 * A plugin can provide any combination of:
 * - Custom list component
 * - Custom detail component
 * - Additional columns for the default list
 * - Additional tabs for the default detail page
 * - Custom status badge logic
 * - Custom actions
 * - Custom icon and color
 */
export interface CrdPlugin {
  /** Unique plugin ID */
  id: string;

  /** Human-readable plugin name */
  name: string;

  /** Plugin description */
  description?: string;

  /**
   * Matcher function to determine if this plugin handles a CRD
   * @param group - API group (e.g., "cert-manager.io")
   * @param kind - Resource kind (e.g., "Certificate")
   * @param plural - Resource plural (e.g., "certificates")
   * @returns true if this plugin should handle the CRD
   */
  matches: (group: string, kind: string, plural: string) => boolean;

  /**
   * Priority for plugin matching (higher = checked first)
   * Default is 0. Use higher values for more specific matchers.
   */
  priority?: number;

  /**
   * Custom icon for the CRD
   */
  icon?: LucideIcon;

  /**
   * Custom color for badges/accents (CSS color or Tailwind class)
   */
  color?: string;

  /**
   * Fully custom list component
   * If provided, replaces the default CustomResourceList
   */
  ListComponent?: ComponentType<CrdPluginListProps>;

  /**
   * Fully custom detail component
   * If provided, replaces the default CustomResourceDetail
   */
  DetailComponent?: ComponentType<CrdPluginDetailProps>;

  /**
   * Additional columns to add to the default list
   * These are merged with the standard columns
   */
  columns?: CrdPluginColumn[];

  /**
   * Additional tabs to add to the default detail page
   * These are appended after the standard tabs
   */
  tabs?: CrdPluginTab[];

  /**
   * Custom status configuration
   */
  status?: CrdPluginStatusConfig;

  /**
   * Custom actions for list and detail views
   */
  actions?: CrdPluginAction[];

  /**
   * Transform function for list items
   * Can be used to enhance/modify the displayed data
   */
  transformListItem?: (item: CustomResourceInfo) => CustomResourceInfo & Record<string, unknown>;

  /**
   * Transform function for detail data
   */
  transformDetail?: (detail: CustomResourceDetailInfo) => CustomResourceDetailInfo & Record<string, unknown>;
}

/**
 * Plugin registration options
 */
export interface PluginRegistrationOptions {
  /** Override existing plugin with same ID */
  override?: boolean;
}

/**
 * Result of plugin lookup
 */
export interface PluginMatch {
  /** The matched plugin */
  plugin: CrdPlugin;
  /** Match score (for debugging) */
  score: number;
}
