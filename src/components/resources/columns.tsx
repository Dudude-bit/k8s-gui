/**
 * Column factory for resource tables
 * 
 * Provides reusable column definitions to reduce duplication across resource lists.
 */

import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatAge } from "@/lib/utils";
import { ResourceUsage } from "@/components/ui/resource-usage";
import { Eye, Trash2 } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
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
  created_at: string | null;
}

interface WithCpuUsage {
  cpu_usage: string | null;
}

interface WithMemoryUsage {
  memory_usage: string | null;
}

interface WithCpuLimits {
  cpu_limits?: string | null;
  cpu_requests?: string | null;
}

interface WithMemoryLimits {
  memory_limits?: string | null;
  memory_requests?: string | null;
}

interface WithLabels {
  labels: Record<string, string>;
}

/**
 * Creates a name column with link to detail page
 */
export function createNameColumn<T extends BaseResource>(
  linkPrefix: string,
  options?: { className?: string }
): ColumnDef<T> {
  return {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
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
export function createSimpleNameColumn<T extends { name: string }>(): ColumnDef<T> {
  return {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.name}</span>
    ),
  };
}

/**
 * Creates a namespace column
 */
export function createNamespaceColumn<T extends { namespace: string }>(): ColumnDef<T> {
  return {
    accessorKey: "namespace",
    header: "Namespace",
  };
}

/**
 * Creates an age column from created_at timestamp
 */
export function createAgeColumn<T extends WithCreatedAt>(): ColumnDef<T> {
  return {
    id: "age",
    header: "Age",
    cell: ({ row }) => formatAge(row.original.created_at),
  };
}

/**
 * Creates a CPU usage column with ResourceUsage component
 */
export function createCpuColumn<T extends WithCpuUsage & Partial<WithCpuLimits>>(
  options?: { showProgressBar?: boolean }
): ColumnDef<T> {
  return {
    id: "cpu",
    header: "CPU",
    cell: ({ row }) => (
      <ResourceUsage
        used={row.original.cpu_usage}
        total={row.original.cpu_limits ?? row.original.cpu_requests ?? null}
        type="cpu"
        showProgressBar={options?.showProgressBar ?? false}
      />
    ),
  };
}

/**
 * Creates a Memory usage column with ResourceUsage component
 */
export function createMemoryColumn<T extends WithMemoryUsage & Partial<WithMemoryLimits>>(
  options?: { showProgressBar?: boolean }
): ColumnDef<T> {
  return {
    id: "memory",
    header: "Memory",
    cell: ({ row }) => (
      <ResourceUsage
        used={row.original.memory_usage}
        total={row.original.memory_limits ?? row.original.memory_requests ?? null}
        type="memory"
        showProgressBar={options?.showProgressBar ?? false}
      />
    ),
  };
}

/**
 * Creates a status badge column
 */
export function createStatusColumn<T extends { status: { phase: string } | string }>(
  _options?: { accessor?: string }
): ColumnDef<T> {
  return {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = typeof row.original.status === "string"
        ? row.original.status
        : row.original.status.phase;
      return <StatusBadge status={status} />;
    },
  };
}

/**
 * Creates a replicas column (ready/desired)
 */
export function createReplicasColumn<T extends { replicas: { ready: number; desired: number } }>(): ColumnDef<T> {
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
export function createLabelsColumn<T extends WithLabels>(
  options?: { maxDisplay?: number }
): ColumnDef<T> {
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
export function createDataKeysColumn<T extends { data_keys: string[] }>(
  options?: { maxDisplay?: number }
): ColumnDef<T> {
  const maxDisplay = options?.maxDisplay ?? 3;
  return {
    accessorKey: "data_keys",
    header: "Keys",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.data_keys.slice(0, maxDisplay).map((key, i) => (
          <Badge key={i} variant="secondary" className="text-xs">
            {key}
          </Badge>
        ))}
        {row.original.data_keys.length > maxDisplay && (
          <Badge variant="outline" className="text-xs">
            +{row.original.data_keys.length - maxDisplay} more
          </Badge>
        )}
      </div>
    ),
  };
}

/**
 * Creates a type badge column
 */
export function createTypeBadgeColumn<T extends { type_: string }>(
  options?: { header?: string }
): ColumnDef<T> {
  return {
    id: "type",
    header: options?.header ?? "Type",
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.type_}</Badge>
    ),
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
  actions: ActionMenuItem<T>[] | ((setDeleteTarget: (item: T) => void) => ActionMenuItem<T>[]),
  setDeleteTarget?: (item: T) => void
): ColumnDef<T> {
  return {
    id: "actions",
    cell: ({ row }) => {
      const resolvedActions = typeof actions === "function"
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
                className={action.variant === "destructive" ? "text-destructive" : undefined}
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
  const columns: ColumnDef<T>[] = [
    createNameColumn<T>(config.linkPrefix),
  ];

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
    columns.push(
      createActionsColumn<T>(config.actions, setDeleteTarget)
    );
  }

  return columns;
}

