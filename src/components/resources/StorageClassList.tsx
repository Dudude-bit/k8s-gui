import { useClusterStore } from "@/stores/clusterStore";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, Trash2, Layers, Star } from "lucide-react";
import { useResourceList } from "@/hooks/useResource";
import { ResourceListHeader } from "@/components/resources/ResourceListHeader";
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
import * as commands from "@/generated/commands";
import type { StorageClassInfo } from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";
import { ResourceType, toPlural } from "@/lib/resource-types";

const columns: ColumnDef<StorageClassInfo>[] = [
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
  {
    id: "actions",
    cell: () => (
      <ActionMenu>
        <DropdownMenuItem>
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </ActionMenu>
    ),
  },
];

export function StorageClassList() {
  const { isConnected } = useClusterStore();

  const {
    data: storageClasses = [],
    isLoading,
    isFetching,
    refetch,
  } = useResourceList(
    [toPlural(ResourceType.StorageClass)],
    async () => {
      try {
        return await commands.listStorageClasses(null);
      } catch (err) {
        throw normalizeTauriError(err);
      }
    },
    { enabled: isConnected }
  );

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel={toPlural(ResourceType.StorageClass)} />;
  }

  return (
    <div className="space-y-4">
      <ResourceListHeader
        title="Storage Classes"
        description="Describes the classes of storage available in the cluster"
        isFetching={isFetching}
        isLoading={isLoading}
        onRefresh={() => refetch()}
      />
      <DataTable
        columns={columns}
        data={storageClasses}
        isLoading={isLoading}
        searchKey="name"
      />
    </div>
  );
}
