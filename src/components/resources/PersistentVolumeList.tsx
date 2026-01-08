import { commands } from "@/lib/commands";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye, Trash2, HardDrive } from "lucide-react";
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

import type { PersistentVolumeInfo } from "@/generated/types";
import { ResourceType, toPlural } from "@/lib/resource-registry";

const baseColumns: ColumnDef<PersistentVolumeInfo>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <HardDrive className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{row.original.name}</span>
      </div>
    ),
  },
  {
    accessorKey: "capacity",
    header: "Capacity",
    cell: ({ row }) => <Badge variant="outline">{row.original.capacity}</Badge>,
  },
  {
    accessorKey: "accessModes",
    header: "Access Modes",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.accessModes.map((mode, i) => (
          <Tooltip key={i}>
            <TooltipTrigger>
              <Badge variant="secondary" className="text-xs">
                {mode}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {mode === "RWO" && "ReadWriteOnce"}
              {mode === "ROX" && "ReadOnlyMany"}
              {mode === "RWX" && "ReadWriteMany"}
              {mode === "RWOP" && "ReadWriteOncePod"}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
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
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "claim",
    header: "Claim",
    cell: ({ row }) => row.original.claim || "-",
  },
  {
    accessorKey: "storageClass",
    header: "Storage Class",
    cell: ({ row }) => row.original.storageClass || "-",
  },
  {
    accessorKey: "age",
    header: "Age",
  },
];

export function PersistentVolumeList() {
  return (
    <ResourceList<PersistentVolumeInfo>
      title="Persistent Volumes"
      description="Cluster-wide storage resources provisioned by an administrator"
      queryKey={[toPlural(ResourceType.PersistentVolume)]}
      queryFn={() => commands.listPersistentVolumes(null)}
      columns={(setDeleteTarget) => [
        ...baseColumns,
        {
          id: "actions",
          cell: ({ row }) => (
            <ActionMenu>
              <DropdownMenuItem asChild>
                <Link
                  to={`/${toPlural(ResourceType.PersistentVolume)}/${row.original.name}`}
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
      emptyStateLabel={toPlural(ResourceType.PersistentVolume)}
      deleteConfig={{
        mutationFn: (item) => commands.deletePersistentVolume(item.name),
        invalidateQueryKeys: [[toPlural(ResourceType.PersistentVolume)]],
        resourceType: ResourceType.PersistentVolume,
      }}
      staleTime={10000}
      searchKey="name"
    />
  );
}
