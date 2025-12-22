import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
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

interface NodeAddressInfo {
  type_: string;
  address: string;
}

interface ConditionInfo {
  type_: string;
  status: string;
  message: string | null;
  reason: string | null;
  last_transition_time: string | null;
}

interface NodeStatusInfo {
  ready: boolean;
  conditions: ConditionInfo[];
  addresses: NodeAddressInfo[];
}

interface ResourceQuantities {
  cpu: string | null;
  memory: string | null;
  pods: string | null;
  ephemeral_storage: string | null;
}

interface NodeInfo {
  name: string;
  uid: string;
  status: NodeStatusInfo;
  roles: string[];
  version: string;
  os: string;
  arch: string;
  container_runtime: string;
  labels: Record<string, string>;
  capacity: ResourceQuantities;
  allocatable: ResourceQuantities;
  created_at: string | null;
}

// Helper to get internal IP
function getInternalIP(addresses: NodeAddressInfo[]): string {
  const internal = addresses.find((a) => a.type_ === "InternalIP");
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
    cell: ({ row }) => formatAge(row.original.created_at),
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
      const result = await invoke<NodeInfo[]>("list_nodes", { filters: null });
      return result;
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
