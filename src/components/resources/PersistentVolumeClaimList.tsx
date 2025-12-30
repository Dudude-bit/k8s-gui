import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useClusterStore } from "@/stores/clusterStore";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, Trash2, Database } from "lucide-react";
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
import type { PersistentVolumeClaimInfo } from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";

const columns: ColumnDef<PersistentVolumeClaimInfo>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{row.original.name}</span>
      </div>
    ),
  },
  {
    accessorKey: "namespace",
    header: "Namespace",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "volume",
    header: "Volume",
    cell: ({ row }) => row.original.volume || "-",
  },
  {
    accessorKey: "capacity",
    header: "Capacity",
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.capacity || "N/A"}</Badge>
    ),
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
    accessorKey: "storageClass",
    header: "Storage Class",
    cell: ({ row }) => row.original.storageClass || "default",
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

export function PersistentVolumeClaimList() {
  const { isConnected, currentNamespace } = useClusterStore();

  const {
    data: pvcs = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["persistent-volume-claims", currentNamespace],
    queryFn: async () => {
      try {
        return await commands.listPersistentVolumeClaims({
          namespace: currentNamespace || null,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
        });
      } catch (err) {
        throw normalizeTauriError(err);
      }
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 10000,
    refetchOnWindowFocus: false,
  });

  if (!isConnected) {
    return (
      <ConnectClusterEmptyState resourceLabel="persistent volume claims" />
    );
  }

  return (
    <div className="space-y-4">
      <ResourceListHeader
        title="Persistent Volume Claims"
        description={`Requests for storage by pods in ${currentNamespace || "all namespaces"}`}
        isFetching={isFetching}
        isLoading={isLoading}
        onRefresh={() => refetch()}
      />
      <DataTable
        columns={columns}
        data={pvcs}
        isLoading={isLoading && pvcs.length === 0}
        isFetching={isFetching && !isLoading}
        searchKey="name"
      />
    </div>
  );
}
