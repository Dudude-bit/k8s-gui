import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { commands } from "@/lib/commands";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, Trash2, HardDrive } from "lucide-react";
import { ResourceList } from "@/components/resources/ResourceList";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { QuickAction } from "@/components/ui/quick-actions";

import type { PersistentVolumeInfo } from "@/generated/types";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import { queryKeys } from "@/lib/query-keys";
import { STALE_TIMES } from "@/lib/refresh";
import { getResourceRowId } from "@/lib/table-utils";



const columns: ColumnDef<PersistentVolumeInfo>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <HardDrive className="h-4 w-4 text-muted-foreground" />
        <Link
          to={getResourceDetailUrl(ResourceType.PersistentVolume, row.original.name)}
          className="font-medium hover:underline"
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
  const navigate = useNavigate();

  const quickActions = useMemo<(setDeleteTarget: (item: PersistentVolumeInfo) => void) => QuickAction<PersistentVolumeInfo>[]>(
    () => (setDeleteTarget) => [
      {
        icon: Eye,
        label: "View Details",
        onClick: (item) => navigate(getResourceDetailUrl(ResourceType.PersistentVolume, item.name)),
      },
      {
        icon: Trash2,
        label: "Delete",
        onClick: (item) => setDeleteTarget(item),
        variant: "destructive",
      },
    ],
    [navigate]
  );

  return (
    <ResourceList<PersistentVolumeInfo>
      title="Persistent Volumes"
      description="Cluster-wide storage resources provisioned by an administrator"
      queryKey={queryKeys.resources(ResourceType.PersistentVolume, null)}
      getRowId={getResourceRowId}
      queryFn={() => commands.listPersistentVolumes(null)}
      columns={columns}
      quickActions={quickActions}
      emptyStateLabel={toPlural(ResourceType.PersistentVolume)}
      deleteConfig={{
        mutationFn: (item) => commands.deletePersistentVolume(item.name),
        invalidateQueryKeys: [queryKeys.resources(ResourceType.PersistentVolume, null)],
        resourceType: ResourceType.PersistentVolume,
      }}
      staleTime={STALE_TIMES.resourceList}
      searchKey="name"
      getRowHref={(row) => getResourceDetailUrl(ResourceType.PersistentVolume, row.name)}
    />
  );
}
