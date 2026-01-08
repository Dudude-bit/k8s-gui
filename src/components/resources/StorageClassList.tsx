import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye, Trash2, Layers, Star } from "lucide-react";
import { ResourceList } from "@/components/resources/ResourceList";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ActionMenu } from "@/components/ui/action-menu";
import { commands } from "@/lib/commands";
import type { StorageClassInfo } from "@/generated/types";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { STALE_TIMES } from "@/lib/refresh";

const storageClassUrlPrefix = `/${toPlural(ResourceType.StorageClass)}`;

const baseColumns: ColumnDef<StorageClassInfo>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{row.original.name}</span>
        {row.original.isDefault && (
          <Tooltip>
            <TooltipTrigger>
              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
            </TooltipTrigger>
            <TooltipContent>Default Storage Class</TooltipContent>
          </Tooltip>
        )}
      </div>
    ),
  },
  {
    accessorKey: "provisioner",
    header: "Provisioner",
    cell: ({ row }) => (
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
        {row.original.provisioner}
      </code>
    ),
  },
  {
    accessorKey: "reclaimPolicy",
    header: "Reclaim Policy",
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.reclaimPolicy}</Badge>
    ),
  },
  {
    accessorKey: "volumeBindingMode",
    header: "Binding Mode",
    cell: ({ row }) => (
      <Badge variant="secondary">{row.original.volumeBindingMode}</Badge>
    ),
  },
  {
    accessorKey: "allowVolumeExpansion",
    header: "Expansion",
    cell: ({ row }) => (
      <Badge
        variant={row.original.allowVolumeExpansion ? "default" : "outline"}
      >
        {row.original.allowVolumeExpansion ? "Allowed" : "Disabled"}
      </Badge>
    ),
  },
  {
    accessorKey: "parameters",
    header: "Parameters",
    cell: ({ row }) => {
      const params = row.original.parameters;
      const paramCount = Object.keys(params).length;
      if (paramCount === 0) return "-";
      return (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline">{paramCount} params</Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              {Object.entries(params).map(([key, value]) => (
                <div key={key} className="text-xs">
                  <span className="font-medium">{key}:</span> {value}
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    accessorKey: "age",
    header: "Age",
  },
];

export function StorageClassList() {
  return (
    <ResourceList<StorageClassInfo>
      title="Storage Classes"
      description="Describes the classes of storage available in the cluster"
      queryKey={[toPlural(ResourceType.StorageClass)]}
      queryFn={() => commands.listStorageClasses(null)}
      columns={(setDeleteTarget) => [
        ...baseColumns,
        {
          id: "actions",
          cell: ({ row }) => (
            <ActionMenu>
              <DropdownMenuItem asChild>
                <Link
                  to={`/${toPlural(ResourceType.StorageClass)}/${row.original.name}`}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDeleteTarget(row.original)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </ActionMenu>
          ),
        },
      ]}
      emptyStateLabel={toPlural(ResourceType.StorageClass)}
      deleteConfig={{
        mutationFn: (item) => commands.deleteStorageClass(item.name),
        invalidateQueryKeys: [[toPlural(ResourceType.StorageClass)]],
        resourceType: ResourceType.StorageClass,
      }}
      staleTime={STALE_TIMES.resourceList}
      searchKey="name"
      getRowHref={(row) => `${storageClassUrlPrefix}/${row.name}`}
    />
  );
}
