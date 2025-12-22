import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye, Trash2 } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useMemo } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { ResourceList } from "./ResourceList";
import {
  createNameColumn,
  createNamespaceColumn,
  createAgeColumn,
} from "./columns";
import type { ServiceInfo, ServicePortInfo } from "@/types/kubernetes";

// Format port for display
function formatPort(port: ServicePortInfo): string {
  let result = `${port.port}`;
  if (port.target_port && port.target_port !== String(port.port)) {
    result += `:${port.target_port}`;
  }
  if (port.node_port) {
    result += `:${port.node_port}`;
  }
  result += `/${port.protocol}`;
  return result;
}

export function ServiceList() {
  const { currentNamespace } = useClusterStore();

  const columns = useMemo<ColumnDef<ServiceInfo>[]>(
    () => [
      createNameColumn<ServiceInfo>("/service"),
      createNamespaceColumn<ServiceInfo>(),
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.type_}</Badge>
        ),
      },
      {
        id: "cluster_ip",
        header: "Cluster IP",
        cell: ({ row }) => row.original.cluster_ip || "-",
      },
      {
        id: "external_ip",
        header: "External IP",
        cell: ({ row }) =>
          row.original.external_ips.length > 0
            ? row.original.external_ips.join(", ")
            : "-",
      },
      {
        id: "ports",
        header: "Ports",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.ports.map((port, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {formatPort(port)}
              </Badge>
            ))}
          </div>
        ),
      },
      createAgeColumn<ServiceInfo>(),
    ],
    [],
  );

  return (
    <ResourceList<ServiceInfo>
      title="Services"
      queryKey={["services", currentNamespace]}
      queryFn={async () => {
        const result = await invoke<ServiceInfo[]>("list_services", {
          filters: { namespace: currentNamespace },
        });
        return result;
      }}
      columns={(setDeleteTarget) => [
        ...columns,
        {
          id: "actions",
          cell: ({ row }) => (
            <ActionMenu>
              <DropdownMenuItem asChild>
                <Link
                  to={`/service/${row.original.namespace}/${row.original.name}`}
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
      emptyStateLabel="services"
      deleteConfig={{
        mutationFn: async (item) => {
          await invoke("delete_service", {
            name: item.name,
            namespace: item.namespace,
          });
        },
        invalidateQueryKeys: [["services"]],
        resourceType: "Service",
      }}
      staleTime={10000}
    />
  );
}
