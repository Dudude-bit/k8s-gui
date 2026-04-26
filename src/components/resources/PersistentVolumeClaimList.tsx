import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, Trash2, Database } from "lucide-react";
import { ResourceList } from "@/components/resources/ResourceList";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { QuickAction } from "@/components/ui/quick-actions";
import { commands } from "@/lib/commands";
import type { PersistentVolumeClaimInfo } from "@/generated/types";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import { queryKeys } from "@/lib/query-keys";
import { STALE_TIMES } from "@/lib/refresh";
import { getResourceRowId } from "@/lib/table-utils";

const columns: ColumnDef<PersistentVolumeClaimInfo>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-muted-foreground" />
        <Link
          to={getResourceDetailUrl(
            ResourceType.PersistentVolumeClaim,
            row.original.name,
            row.original.namespace
          )}
          className="font-medium text-primary hover:underline"
        >
          {row.original.name}
        </Link>
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
];

export function PersistentVolumeClaimList() {
  const { currentNamespace } = useClusterStore();
  const navigate = useNavigate();

  const quickActions = useMemo<
    (
      setDeleteTarget: (item: PersistentVolumeClaimInfo) => void
    ) => QuickAction<PersistentVolumeClaimInfo>[]
  >(
    () => (setDeleteTarget) => [
      {
        icon: Eye,
        label: "View Details",
        onClick: (item) =>
          navigate(
            getResourceDetailUrl(
              ResourceType.PersistentVolumeClaim,
              item.name,
              item.namespace
            )
          ),
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
    <ResourceList<PersistentVolumeClaimInfo>
      title="Persistent Volume Claims"
      description={`Requests for storage by pods in ${currentNamespace || "all namespaces"}`}
      queryKey={queryKeys.resources(
        ResourceType.PersistentVolumeClaim,
        currentNamespace
      )}
      getRowId={getResourceRowId}
      queryFn={() =>
        commands.listPersistentVolumeClaims({
          namespace: currentNamespace || null,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
        })
      }
      columns={columns}
      quickActions={quickActions}
      emptyStateLabel={toPlural(ResourceType.PersistentVolumeClaim)}
      deleteConfig={{
        mutationFn: (item) =>
          commands.deletePersistentVolumeClaim(
            item.name,
            item.namespace ?? null
          ),
        invalidateQueryKeys: [
          queryKeys.resources(
            ResourceType.PersistentVolumeClaim,
            currentNamespace
          ),
        ],
        resourceType: ResourceType.PersistentVolumeClaim,
      }}
      staleTime={STALE_TIMES.resourceList}
      searchKey="name"
      getRowHref={(row) =>
        getResourceDetailUrl(
          ResourceType.PersistentVolumeClaim,
          row.name,
          row.namespace
        )
      }
    />
  );
}
