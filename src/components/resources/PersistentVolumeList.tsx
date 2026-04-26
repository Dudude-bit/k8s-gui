import { Link } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { HardDrive } from "lucide-react";

import type { PersistentVolumeInfo } from "@/generated/types";
import { commands } from "@/lib/commands";
import { ResourceType } from "@/lib/resource-registry";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createResourceListPage } from "./createResourceListPage";

const ACCESS_MODE_TOOLTIP: Record<string, string> = {
  RWO: "ReadWriteOnce",
  ROX: "ReadOnlyMany",
  RWX: "ReadWriteMany",
  RWOP: "ReadWriteOncePod",
};

const columns = (): ColumnDef<PersistentVolumeInfo>[] => [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <HardDrive className="h-4 w-4 text-muted-foreground" />
        <Link
          to={getResourceDetailUrl(
            ResourceType.PersistentVolume,
            row.original.name
          )}
          className="font-medium text-primary hover:underline"
        >
          {row.original.name}
        </Link>
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
            <TooltipContent>{ACCESS_MODE_TOOLTIP[mode] ?? mode}</TooltipContent>
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

export const PersistentVolumeList =
  createResourceListPage<PersistentVolumeInfo>({
    resourceType: ResourceType.PersistentVolume,
    title: "Persistent Volumes",
    description:
      "Cluster-wide storage resources provisioned by an administrator",
    scope: "cluster",
    searchKey: "name",
    fetcher: () => commands.listPersistentVolumes(null),
    deleter: (item) => commands.deletePersistentVolume(item.name),
    columns,
  });
