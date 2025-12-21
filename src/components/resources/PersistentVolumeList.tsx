import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, Trash2, RefreshCw, HardDrive } from "lucide-react";
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

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case "available":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "bound":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "released":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "failed":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    default:
      return "bg-gray-500/10 text-gray-500 border-gray-500/20";
  }
};

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
      <Badge className={getStatusColor(row.original.status)}>
        {row.original.status}
      </Badge>
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
    refetch,
  } = useQuery({
    queryKey: ["persistent-volumes"],
    queryFn: async () => {
      const result = await invoke<PersistentVolumeInfo[]>(
        "list_persistent_volumes",
      );
      return result;
    },
    enabled: isConnected,
    staleTime: 10000,
    refetchOnWindowFocus: false,
  });

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="persistent volumes" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Persistent Volumes</h1>
          <p className="text-sm text-muted-foreground">
            Cluster-wide storage resources provisioned by an administrator
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={pvs}
        isLoading={isLoading}
        searchKey="name"
      />
    </div>
  );
}
