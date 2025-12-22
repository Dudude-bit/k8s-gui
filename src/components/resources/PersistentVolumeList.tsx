import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { useResourceList } from "@/hooks/useResource";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, Trash2, HardDrive } from "lucide-react";
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

interface PersistentVolumeInfo {
  name: string;
  capacity: string;
  access_modes: string[];
  reclaim_policy: string;
  status: string;
  claim: string | null;
  storage_class: string;
  reason: string | null;
  age: string;
}

const columns: ColumnDef<PersistentVolumeInfo>[] = [
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
    accessorKey: "access_modes",
    header: "Access Modes",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.access_modes.map((mode, i) => (
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
    accessorKey: "reclaim_policy",
    header: "Reclaim Policy",
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.reclaim_policy}</Badge>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge status={row.original.status} />
    ),
  },
  {
    accessorKey: "claim",
    header: "Claim",
    cell: ({ row }) => row.original.claim || "-",
  },
  {
    accessorKey: "storage_class",
    header: "Storage Class",
    cell: ({ row }) => row.original.storage_class || "-",
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

export function PersistentVolumeList() {
  const { isConnected } = useClusterStore();

  const {
    data: pvs = [],
    isLoading,
    isFetching,
    refetch,
  } = useResourceList(
    ["persistent-volumes"],
    async () => {
      const result = await invoke<PersistentVolumeInfo[]>(
        "list_persistent_volumes",
      );
      return result;
    },
    { enabled: isConnected }
  );

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="persistent volumes" />;
  }

  return (
    <div className="space-y-4">
      <ResourceListHeader
        title="Persistent Volumes"
        description="Cluster-wide storage resources provisioned by an administrator"
        isFetching={isFetching}
        isLoading={isLoading}
        onRefresh={() => refetch()}
      />
      <DataTable
        columns={columns}
        data={pvs}
        isLoading={isLoading}
        searchKey="name"
      />
    </div>
  );
}
