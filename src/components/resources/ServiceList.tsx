import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Eye, Trash2, RefreshCw, Loader2 } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatAge } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { ActionMenu } from "@/components/ui/action-menu";

interface ServicePortInfo {
  name: string | null;
  port: number;
  target_port: string;
  node_port: number | null;
  protocol: string;
}

interface ServiceInfo {
  name: string;
  namespace: string;
  uid: string;
  type_: string;
  cluster_ip: string | null;
  external_ips: string[];
  ports: ServicePortInfo[];
  selector: Record<string, string>;
  labels: Record<string, string>;
  created_at: string | null;
}

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
  const { isConnected, currentNamespace } = useClusterStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<ServiceInfo | null>(null);

  const {
    data: services = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["services", currentNamespace],
    queryFn: async () => {
      const result = await invoke<ServiceInfo[]>("list_services", {
        filters: { namespace: currentNamespace },
      });
      return result;
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 10000,
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: async ({
      name,
      namespace,
    }: {
      name: string;
      namespace: string;
    }) => {
      await invoke("delete_service", { name, namespace });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast({
        title: "Service deleted",
        description: "The service has been deleted successfully.",
      });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete service: ${error}`,
        variant: "destructive",
      });
      setDeleteTarget(null);
    },
  });

  const columns = useMemo<ColumnDef<ServiceInfo>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to={`/service/${row.original.namespace}/${row.original.name}`}
            className="font-medium hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "namespace",
        header: "Namespace",
      },
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
    ],
    [setDeleteTarget],
  );

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="services" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Services</h1>
          {isFetching && !isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
          />
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={services}
        isLoading={isLoading && services.length === 0}
        isFetching={isFetching && !isLoading}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title="Delete service?"
        description={
          deleteTarget
            ? `This will delete ${deleteTarget.name} in ${deleteTarget.namespace}.`
            : undefined
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        confirmDisabled={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate({
              name: deleteTarget.name,
              namespace: deleteTarget.namespace,
            });
          }
        }}
      />
    </div>
  );
}
