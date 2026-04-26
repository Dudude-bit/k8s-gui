import { Link } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { Layers, Star } from "lucide-react";
import type { StorageClassInfo } from "@/generated/types";
import { commands } from "@/lib/commands";
import { ResourceType } from "@/lib/resource-registry";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createResourceListPage } from "./createResourceListPage";

const columns = (): ColumnDef<StorageClassInfo>[] => [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <Link
          to={getResourceDetailUrl(
            ResourceType.StorageClass,
            row.original.name
          )}
          className="font-medium text-primary hover:underline"
        >
          {row.original.name}
        </Link>
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

export const StorageClassList = createResourceListPage<StorageClassInfo>({
  resourceType: ResourceType.StorageClass,
  title: "Storage Classes",
  description: "Describes the classes of storage available in the cluster",
  scope: "cluster",
  searchKey: "name",
  fetcher: () => commands.listStorageClasses(null),
  deleter: (item) => commands.deleteStorageClass(item.name),
  columns,
});
