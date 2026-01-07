import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, Trash2 } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ActionMenu } from "@/components/ui/action-menu";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { useClusterStore } from "@/stores/clusterStore";
import { ResourceListHeader } from "@/components/resources/ResourceListHeader";
import { createAgeColumn, createNamespaceColumn } from "./columns";
import { formatAge } from "@/lib/utils";
import { normalizeTauriError } from "@/lib/error-utils";
import { ResourceType, toPlural } from "@/lib/resource-types";
import { usePlugin } from "@/lib/crd-plugins";
import { getKindSpecificColumns } from "@/lib/crd-plugins/plugins";
import * as commands from "@/generated/commands";
import type { CustomResourceInfo, PrinterColumn } from "@/generated/types";

interface CustomResourceListProps {
  crdName: string;
  crdKind: string;
  crdGroup: string; // API group (e.g., "cert-manager.io")
  crdPlural: string; // Plural name (e.g., "certificates")
  scope: "Namespaced" | "Cluster";
  printerColumns?: PrinterColumn[];
  embedded?: boolean; // If true, renders without header (for embedding in detail pages)
}

// Extended type to make namespace always a string for DataTable compatibility
type CustomResourceListItem = CustomResourceInfo & { namespace: string };

export function CustomResourceList({
  crdName,
  crdKind,
  crdGroup,
  crdPlural,
  scope,
  printerColumns = [],
  embedded = false,
}: CustomResourceListProps) {
  const { currentNamespace, isConnected } = useClusterStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<CustomResourceListItem | null>(null);

  // Get plugin for this CRD (if any)
  const plugin = usePlugin(crdGroup, crdKind, crdPlural);

  const namespace = scope === "Namespaced" ? currentNamespace : null;

  const {
    data: resources = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["custom-resources", crdName, namespace],
    queryFn: async () => {
      try {
        const result = await commands.listCustomResources(
          crdName,
          namespace || null,
          null, // labelSelector
          null // limit
        );
        // Ensure namespace is always a string
        return result.map((r) => ({
          ...r,
          namespace: r.namespace || "",
        }));
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: isConnected,
    staleTime: 10000,
    refetchInterval: 15000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (item: CustomResourceListItem) => {
      try {
        await commands.deleteCustomResource(
          crdName,
          item.name,
          item.namespace || null
        );
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    onSuccess: (_, item) => {
      toast({
        title: `${crdKind} deleted`,
        description: `${item.name} has been deleted.`,
      });
      queryClient.invalidateQueries({ queryKey: ["custom-resources", crdName] });
    },
    onError: (error: Error) => {
      toast({
        title: `Failed to delete ${crdKind}`,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Build columns from printer columns and plugin
  const columns = useMemo<ColumnDef<CustomResourceListItem>[]>(() => {
    const cols: ColumnDef<CustomResourceListItem>[] = [];

    // Name column (always first)
    cols.push({
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const item = row.original;
        const detailPath = scope === "Namespaced"
          ? `/${toPlural(ResourceType.CustomResourceDefinition)}/${encodeURIComponent(crdName)}/instances/${item.namespace}/${item.name}`
          : `/${toPlural(ResourceType.CustomResourceDefinition)}/${encodeURIComponent(crdName)}/instances/${item.name}`;
        return (
          <Link
            to={detailPath}
            className="font-medium text-primary hover:underline"
          >
            {item.name}
          </Link>
        );
      },
    });

    // Namespace column for namespaced resources
    if (scope === "Namespaced") {
      cols.push(createNamespaceColumn<CustomResourceListItem>());
    }

    // Try to get plugin-specific columns first
    const pluginColumns = plugin
      ? getKindSpecificColumns(plugin.id, crdKind) || plugin.columns
      : null;

    if (pluginColumns && pluginColumns.length > 0) {
      // Use plugin columns
      for (const pc of pluginColumns) {
        cols.push({
          id: pc.id,
          header: pc.header,
          cell: ({ row }) => {
            const value = pc.accessor(row.original);
            if (pc.cell) {
              return pc.cell(value);
            }
            // Default formatting with status config from plugin
            if (plugin?.status && typeof value === "string") {
              const variant = plugin.status.getVariant(value);
              return <Badge variant={variant}>{value}</Badge>;
            }
            if (value === null || value === undefined) {
              return <span className="text-muted-foreground">-</span>;
            }
            return String(value);
          },
        });
      }
    } else {
      // Fallback to printer columns from CRD
      for (const pc of printerColumns) {
        // Skip NAME and AGE as we handle them separately
        if (pc.name === "NAME" || pc.name === "AGE") continue;

        cols.push({
          id: pc.name.toLowerCase().replace(/\s+/g, "-"),
          header: pc.name,
          cell: ({ row }) => {
            const value = getValueFromJsonPath(row.original, pc.jsonPath);
            return formatColumnValue(value, pc.columnType);
          },
        });
      }
    }

    // Age column (always last before actions)
    cols.push(createAgeColumn<CustomResourceListItem>());

    // Actions column
    cols.push({
      id: "actions",
      cell: ({ row }) => {
        const item = row.original;
        const detailPath = scope === "Namespaced"
          ? `/${toPlural(ResourceType.CustomResourceDefinition)}/${encodeURIComponent(crdName)}/instances/${item.namespace}/${item.name}`
          : `/${toPlural(ResourceType.CustomResourceDefinition)}/${encodeURIComponent(crdName)}/instances/${item.name}`;

        return (
          <ActionMenu>
            <DropdownMenuItem asChild>
              <Link to={detailPath}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setDeleteTarget(item)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </ActionMenu>
        );
      },
    });

    return cols;
  }, [crdName, crdKind, scope, printerColumns, plugin]);

  const content = (
    <>
      <DataTable
        columns={columns}
        data={resources}
        isLoading={isLoading}
        searchPlaceholder={`Search ${crdKind}...`}
        searchKey="name"
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={`Delete ${crdKind}?`}
        description={`Are you sure you want to delete "${deleteTarget?.name}"?`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        confirmDisabled={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget);
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="space-y-4">
      <ResourceListHeader
        title={`${crdKind} Instances (${resources.length})`}
        isLoading={isLoading}
        isFetching={isFetching}
        onRefresh={() => refetch()}
      />
      {content}
    </div>
  );
}

// Helper function to get value from JSON path
function getValueFromJsonPath(obj: CustomResourceInfo, jsonPath: string): unknown {
  // Remove leading dot if present
  const path = jsonPath.startsWith(".") ? jsonPath.slice(1) : jsonPath;
  const parts = path.split(".");

  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;

    // Handle array notation like [0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = (current as Record<string, unknown>)[key];
      if (Array.isArray(current)) {
        current = current[parseInt(index, 10)];
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

// Helper function to format column value based on type
function formatColumnValue(value: unknown, columnType: string): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">-</span>;
  }

  switch (columnType) {
    case "date":
      if (typeof value === "string") {
        return formatAge(value);
      }
      return String(value);

    case "integer":
    case "number":
      return (
        <span className="font-mono">
          {typeof value === "number" ? value.toLocaleString() : String(value)}
        </span>
      );

    case "boolean":
      return (
        <Badge variant={value ? "default" : "secondary"}>
          {String(value)}
        </Badge>
      );

    case "string":
    default:
      // Check if it looks like a status
      if (typeof value === "string") {
        const lowerValue = value.toLowerCase();
        if (
          lowerValue === "true" ||
          lowerValue === "ready" ||
          lowerValue === "running" ||
          lowerValue === "active" ||
          lowerValue === "healthy"
        ) {
          return <Badge variant="default">{value}</Badge>;
        }
        if (
          lowerValue === "false" ||
          lowerValue === "notready" ||
          lowerValue === "failed" ||
          lowerValue === "error"
        ) {
          return <Badge variant="destructive">{value}</Badge>;
        }
        if (
          lowerValue === "pending" ||
          lowerValue === "progressing" ||
          lowerValue === "unknown"
        ) {
          return <Badge variant="secondary">{value}</Badge>;
        }
      }
      return <span className="truncate max-w-[200px]">{String(value)}</span>;
  }
}
