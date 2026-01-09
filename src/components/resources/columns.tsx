/**
 * Column factory for resource tables
 *
 * Provides reusable column definitions to reduce duplication across resource lists.
 */

import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { RealtimeAge } from "@/components/ui/realtime";
import { MetricBadge } from "@/components/ui/metric-card";
import { Eye, Trash2 } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { parseCPU, parseMemory } from "@/lib/k8s-quantity";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// Base resource interface for column constraints
interface BaseResource {
  name: string;
  namespace: string;
}

interface WithCreatedAt {
  createdAt?: string | null;
}

interface WithCpuUsage {
  cpuMillicores?: number | null;
}

interface WithMemoryUsage {
  memoryBytes?: number | null;
}

interface WithCpuLimits {
  cpuLimits?: string | null;
  cpuRequests?: string | null;
}

interface WithMemoryLimits {
  memoryLimits?: string | null;
  memoryRequests?: string | null;
}

interface WithLabels {
  labels: Record<string, string>;
}

/**
 * Creates a name column with link to detail page
 * @param linkPrefix - URL prefix for the detail page
 * @param options.className - Custom class name for the link/span
 * @param options.disableLink - If true, renders as span instead of link (use with row-level click)
 */
export function createNameColumn<T extends BaseResource>(
  linkPrefix: string,
  options?: { className?: string; disableLink?: boolean }
): ColumnDef<T> {
  return {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) =>
      options?.disableLink ? (
        <span className={options?.className ?? "font-medium"}>
          {row.original.name}
        </span>
      ) : (
        <Link
          to={`${linkPrefix}/${row.original.namespace}/${row.original.name}`}
          className={options?.className ?? "font-medium hover:underline"}
        >
          {row.original.name}
        </Link>
      ),
  };
}

/**
 * Creates a name column without link (just displays the name)
 */
export function createSimpleNameColumn<
  T extends { name: string },
>(): ColumnDef<T> {
  return {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  };
}

/**
 * Creates a namespace column
 */
export function createNamespaceColumn<
  T extends { namespace: string },
>(): ColumnDef<T> {
  return {
    accessorKey: "namespace",
    header: "Namespace",
  };
}

/**
 * Creates an age column from created_at timestamp
 * Uses RealtimeAge for auto-updating display
 */
export function createAgeColumn<T extends WithCreatedAt>(): ColumnDef<T> {
  return {
    id: "age",
    header: "Age",
    cell: ({ row }) => <RealtimeAge timestamp={row.original.createdAt} />,
  };
}

/**
 * Creates a generic time-ago column for any timestamp field
 * Uses RealtimeAge for auto-updating display
 */
export function createTimeAgoColumn<T>(
  accessor: (row: T) => string | null | undefined,
  header: string
): ColumnDef<T> {
  return {
    id: header.toLowerCase().replace(/\s+/g, "-"),
    header,
    cell: ({ row }) => <RealtimeAge timestamp={accessor(row.original)} />,
  };
}

// ... (import MetricBadge)

/**
 * Creates a CPU usage column with MetricBadge component
 */
export function createCpuColumn<
  T extends WithCpuUsage & Partial<WithCpuLimits>,
>(): ColumnDef<T> {
  return {
    id: "cpu",
    header: "CPU",
    cell: ({ row }) => {
      const used = row.original.cpuMillicores ?? null;
      const total = row.original.cpuLimits
        ? parseCPU(row.original.cpuLimits)
        : row.original.cpuRequests
          ? parseCPU(row.original.cpuRequests)
          : null;
      return <MetricBadge used={used} total={total} type="cpu" />;
    },
  };
}

/**
 * Creates a Memory usage column with MetricBadge component
 */
export function createMemoryColumn<
  T extends WithMemoryUsage & Partial<WithMemoryLimits>,
>(): ColumnDef<T> {
  return {
    id: "memory",
    header: "Memory",
    cell: ({ row }) => {
      const used = row.original.memoryBytes ?? null;
      const total =
        row.original.memoryLimits
          ? parseMemory(row.original.memoryLimits)
          : row.original.memoryRequests
            ? parseMemory(row.original.memoryRequests)
            : null;
      return <MetricBadge used={used} total={total} type="memory" />;
    },
  };
}

/**
 * Creates a status badge column
 */
export function createStatusColumn<
  T extends { status: { phase: string } | string },
>(_options?: { accessor?: string }): ColumnDef<T> {
  return {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const status =
        typeof row.original.status === "string"
          ? row.original.status
          : row.original.status.phase;
      return <StatusBadge status={status} />;
    },
  };
}

/**
 * Creates a replicas column (ready/desired)
 */
export function createReplicasColumn<
  T extends { replicas: { ready: number; desired: number } },
>(): ColumnDef<T> {
  return {
    id: "replicas",
    header: "Replicas",
    cell: ({ row }) => {
      const { ready, desired } = row.original.replicas;
      const isHealthy = ready === desired;
      return (
        <span className={isHealthy ? "text-green-500" : "text-yellow-500"}>
          {ready}/{desired}
        </span>
      );
    },
  };
}

/**
 * Creates a labels column showing badges
 */
export function createLabelsColumn<T extends WithLabels>(options?: {
  maxDisplay?: number;
}): ColumnDef<T> {
  const maxDisplay = options?.maxDisplay ?? 3;
  return {
    id: "labels",
    header: "Labels",
    cell: ({ row }) => {
      const entries = Object.entries(row.original.labels);
      return (
        <div className="flex flex-wrap gap-1">
          {entries.slice(0, maxDisplay).map(([key, value]) => (
            <Badge key={key} variant="outline" className="text-xs">
              {key}={value}
            </Badge>
          ))}
          {entries.length > maxDisplay && (
            <Badge variant="secondary" className="text-xs">
              +{entries.length - maxDisplay} more
            </Badge>
          )}
        </div>
      );
    },
  };
}

/**
 * Creates a data keys column for ConfigMaps/Secrets
 */
export function createDataKeysColumn<
  T extends { dataKeys?: string[] },
>(options?: { maxDisplay?: number }): ColumnDef<T> {
  const maxDisplay = options?.maxDisplay ?? 3;
  return {
    id: "dataKeys",
    header: "Keys",
    cell: ({ row }) => {
      const keys = row.original.dataKeys ?? [];
      return (
        <div className="flex flex-wrap gap-1">
          {keys.slice(0, maxDisplay).map((key, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {key}
            </Badge>
          ))}
          {keys.length > maxDisplay && (
            <Badge variant="outline" className="text-xs">
              +{keys.length - maxDisplay} more
            </Badge>
          )}
        </div>
      );
    },
  };
}

/**
 * Creates a type badge column
 */
export function createTypeBadgeColumn<T extends { type?: string }>(options?: {
  header?: string;
}): ColumnDef<T> {
  return {
    id: "type",
    header: options?.header ?? "Type",
    cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
  };
}

/**
 * Action menu item definitions for reuse
 */
export interface ActionMenuItem<T> {
  type: "item" | "separator";
  label?: string;
  icon?: React.ReactNode;
  onClick?: (item: T) => void;
  href?: (item: T) => string;
  variant?: "default" | "destructive";
}

/**
 * Creates an actions column with dropdown menu
 */
export function createActionsColumn<T extends BaseResource>(
  actions:
    | ActionMenuItem<T>[]
    | ((setDeleteTarget: (item: T) => void) => ActionMenuItem<T>[]),
  setDeleteTarget?: (item: T) => void
): ColumnDef<T> {
  return {
    id: "actions",
    cell: ({ row }) => {
      const resolvedActions =
        typeof actions === "function"
          ? actions(setDeleteTarget ?? (() => {}))
          : actions;

      return (
        <ActionMenu>
          {resolvedActions.map((action, index) => {
            if (action.type === "separator") {
              return <DropdownMenuSeparator key={index} />;
            }

            if (action.href) {
              return (
                <DropdownMenuItem key={index} asChild>
                  <Link to={action.href(row.original)}>
                    {action.icon}
                    {action.label}
                  </Link>
                </DropdownMenuItem>
              );
            }

            return (
              <DropdownMenuItem
                key={index}
                className={
                  action.variant === "destructive"
                    ? "text-destructive"
                    : undefined
                }
                onClick={() => action.onClick?.(row.original)}
              >
                {action.icon}
                {action.label}
              </DropdownMenuItem>
            );
          })}
        </ActionMenu>
      );
    },
  };
}

/**
 * Creates standard view/delete actions
 */
export function createStandardActions<T extends BaseResource>(
  linkPrefix: string,
  setDeleteTarget: (item: T) => void
): ActionMenuItem<T>[] {
  return [
    {
      type: "item",
      label: "View Details",
      icon: <Eye className="mr-2 h-4 w-4" />,
      href: (item) => `${linkPrefix}/${item.namespace}/${item.name}`,
    },
    { type: "separator" },
    {
      type: "item",
      label: "Delete",
      icon: <Trash2 className="mr-2 h-4 w-4" />,
      onClick: setDeleteTarget,
      variant: "destructive",
    },
  ];
}

/**
 * Builds a complete column set for a resource list
 */
export function buildResourceColumns<T extends BaseResource & WithCreatedAt>(
  config: {
    linkPrefix: string;
    includeNamespace?: boolean;
    includeCpu?: boolean;
    includeMemory?: boolean;
    customColumns?: ColumnDef<T>[];
    actions?: (setDeleteTarget: (item: T) => void) => ActionMenuItem<T>[];
  },
  setDeleteTarget?: (item: T) => void
): ColumnDef<T>[] {
  const columns: ColumnDef<T>[] = [createNameColumn<T>(config.linkPrefix)];

  if (config.includeNamespace !== false) {
    columns.push(createNamespaceColumn<T>());
  }

  if (config.includeCpu) {
    columns.push(createCpuColumn<T & WithCpuUsage>() as ColumnDef<T>);
  }

  if (config.includeMemory) {
    columns.push(createMemoryColumn<T & WithMemoryUsage>() as ColumnDef<T>);
  }

  if (config.customColumns) {
    columns.push(...config.customColumns);
  }

  columns.push(createAgeColumn<T>());

  if (config.actions && setDeleteTarget) {
    columns.push(createActionsColumn<T>(config.actions, setDeleteTarget));
  }

  return columns;
}
