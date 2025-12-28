import { useQuery, keepPreviousData } from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import { NodeInfo, NodeAddressInfo } from "@/generated/types";
import { useClusterStore } from "@/stores/clusterStore";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye } from "lucide-react";
import { ResourceListHeader } from "@/components/resources/ResourceListHeader";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatAge, formatKubernetesBytes } from "@/lib/utils";
import { ActionMenu } from "@/components/ui/action-menu";
import { normalizeTauriError } from "@/lib/error-utils";

// Helper to get internal IP
function getInternalIP(addresses: NodeAddressInfo[]): string {
  const internal = addresses.find((a) => a.type === "InternalIP");
  return internal?.address || "-";
}

const columns: ColumnDef<NodeInfo>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <Link
        to={`/nodes/${row.original.name}`}
        className="font-medium hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status.ready ? "Ready" : "NotReady";
      return <StatusBadge status={status} />;
    },
  },
  {
    accessorKey: "roles",
    header: "Roles",
    cell: ({ row }) => (
      <div className="flex gap-1">
        {row.original.roles.map((role) => (
          <Badge key={role} variant="outline">
            {role}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    accessorKey: "version",
    header: "Version",
  },
  {
    id: "internal_ip",
    header: "Internal IP",
    cell: ({ row }) => getInternalIP(row.original.status.addresses),
  },
  {
    id: "cpu",
    header: "CPU",
    cell: ({ row }) => row.original.capacity.cpu || "-",
  },
  {
    id: "memory",
    header: "Memory",
    cell: ({ row }) => formatKubernetesBytes(row.original.capacity.memory),
  },
  {
    id: "age",
    header: "Age",
    cell: ({ row }) => formatAge(row.original.createdAt),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <ActionMenu>
        <DropdownMenuItem asChild>
          <Link to={`/nodes/${row.original.name}`}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </Link>
        </DropdownMenuItem>
      </ActionMenu>
    ),
  },
];

export function Nodes() {
  const { isConnected } = useClusterStore();

  const {
    data: nodes = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["nodes"],
    queryFn: async () => {
      try {
        const result = await commands.listNodes(null);
        return result;
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 10000,
  });

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="nodes" />;
  }

  const showSkeleton = isLoading && nodes.length === 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <ResourceListHeader
        title="Nodes"
        isFetching={isFetching}
        isLoading={isLoading}
        onRefresh={() => refetch()}
      />
      <DataTable
        columns={columns}
        data={nodes}
        isLoading={showSkeleton}
        isFetching={isFetching && !isLoading}
      />
    </div>
  );
}
