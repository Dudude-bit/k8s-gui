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
import { Eye, Trash2, RotateCw, Scale, RefreshCw, Loader2 } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatAge, getStatusColor } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { ActionMenu } from "@/components/ui/action-menu";

interface ConditionInfo {
  type_: string;
  status: string;
  reason: string | null;
  message: string | null;
  last_transition_time: string | null;
}

interface ReplicaInfo {
  desired: number;
  ready: number;
  available: number;
  updated: number;
}

interface DeploymentInfo {
  name: string;
  namespace: string;
  uid: string;
  replicas: ReplicaInfo;
  strategy: string | null;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  created_at: string | null;
  conditions: ConditionInfo[];
}

export function DeploymentList() {
  const { isConnected, currentNamespace } = useClusterStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<DeploymentInfo | null>(null);

  const {
    data: deployments = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["deployments", currentNamespace],
    queryFn: async () => {
      const result = await invoke<DeploymentInfo[]>("list_deployments", {
        filters: { namespace: currentNamespace },
      });
      return result;
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 5000,
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
      await invoke("delete_deployment", { name, namespace });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployments"] });
      toast({
        title: "Deployment deleted",
        description: "The deployment has been deleted successfully.",
      });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete deployment: ${error}`,
        variant: "destructive",
      });
      setDeleteTarget(null);
    },
  });

  const columns = useMemo<ColumnDef<DeploymentInfo>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to={`/deployment/${row.original.namespace}/${row.original.name}`}
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
        id: "replicas",
        header: "Replicas",
        cell: ({ row }) => {
          const ready = row.original.replicas.ready || 0;
          const total = row.original.replicas.desired;
          const isHealthy = ready === total;
          return (
            <span className={isHealthy ? "text-green-500" : "text-yellow-500"}>
              {ready}/{total}
            </span>
          );
        },
      },
      {
        id: "strategy",
        header: "Strategy",
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.strategy || "RollingUpdate"}
          </Badge>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const available = row.original.replicas.available || 0;
          const total = row.original.replicas.desired;
          const status = available === total ? "Available" : "Progressing";
          return <Badge className={getStatusColor(status)}>{status}</Badge>;
        },
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
                to={`/deployment/${row.original.namespace}/${row.original.name}`}
              >
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Scale className="mr-2 h-4 w-4" />
              Scale
            </DropdownMenuItem>
            <DropdownMenuItem>
              <RotateCw className="mr-2 h-4 w-4" />
              Restart
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
    return <ConnectClusterEmptyState resourceLabel="deployments" />;
  }

  const showSkeleton = isLoading && deployments.length === 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Deployments</h1>
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
        data={deployments}
        isLoading={showSkeleton}
        isFetching={isFetching && !isLoading}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title="Delete deployment?"
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
