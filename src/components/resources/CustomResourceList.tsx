import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { QuickAction } from "@/components/ui/quick-actions";
import { useClusterStore } from "@/stores/clusterStore";
import { createAgeColumn, createNamespaceColumn } from "./columns";
import { RealtimeAge } from "@/components/ui/realtime";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { usePlugin } from "@/lib/crd-plugins";
import { getKindSpecificColumns } from "@/lib/crd-plugins/plugins";
import { commands } from "@/lib/commands";
import { ResourceList } from "@/components/resources/ResourceList";
import type { CustomResourceInfo, PrinterColumn } from "@/generated/types";
import { REFRESH_INTERVALS, STALE_TIMES } from "@/lib/refresh";
import { getResourceRowId } from "@/lib/table-utils";

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
  const { currentNamespace } = useClusterStore();

  // Get plugin for this CRD (if any)
  const plugin = usePlugin(crdGroup, crdKind, crdPlural);

  const navigate = useNavigate();
  const namespace = scope === "Namespaced" ? currentNamespace : null;

  // Generate detail path for a custom resource
  const getDetailPath = (item: CustomResourceListItem) =>
    scope === "Namespaced"
      ? `/${toPlural(ResourceType.CustomResourceDefinition)}/${encodeURIComponent(crdName)}/instances/${item.namespace}/${item.name}`
      : `/${toPlural(ResourceType.CustomResourceDefinition)}/${encodeURIComponent(crdName)}/instances/${item.name}`;

  const quickActions = useMemo<(setDeleteTarget: (item: CustomResourceListItem) => void) => QuickAction<CustomResourceListItem>[]>(
    () => (setDeleteTarget) => [
      {
        icon: Eye,
        label: "View Details",
        onClick: (item) => navigate(getDetailPath(item)),
      },
      {
        icon: Trash2,
        label: "Delete",
        onClick: (item) => setDeleteTarget(item),
        variant: "destructive",
      },
    ],
    [navigate, scope, crdName]
  );

  // Build columns from printer columns and plugin
  const baseColumns = useMemo<ColumnDef<CustomResourceListItem>[]>(() => {
    const cols: ColumnDef<CustomResourceListItem>[] = [];

    // Name column (always first) - use simple text since row is clickable
    cols.push({
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <Link
          to={getDetailPath(row.original)}
          className="font-medium text-primary hover:underline"
        >
          {row.original.name}
        </Link>
      ),
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

    return cols;
  }, [crdName, crdKind, scope, printerColumns, plugin]);

  return (
    <ResourceList<CustomResourceListItem>
      title={(count) => `${crdKind} Instances (${count})`}
      queryKey={["custom-resources", crdName, namespace ?? "all"]}
      getRowId={getResourceRowId}
      queryFn={async () => {
        const result = await commands.listCustomResources(
          crdName,
          namespace || null,
          null,
          null
        );
        return result.map((r) => ({
          ...r,
          namespace: r.namespace || "",
        }));
      }}
      columns={baseColumns}
      quickActions={quickActions}
      emptyStateLabel={crdPlural}
      deleteConfig={{
        mutationFn: (item) => commands.deleteCustomResource(
          crdName,
          item.name,
          item.namespace || null
        ),
        invalidateQueryKeys: [["custom-resources", crdName]],
        resourceType: crdKind,
      }}
      staleTime={STALE_TIMES.resourceList}
      refetchInterval={REFRESH_INTERVALS.resourceList}
      searchKey="name"
      searchPlaceholder={`Search ${crdKind}...`}
      embedded={embedded}
      getRowHref={getDetailPath}
    />
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
        return <RealtimeAge timestamp={value} />;
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
