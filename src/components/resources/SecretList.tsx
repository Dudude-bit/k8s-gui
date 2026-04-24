import { commands } from "@/lib/commands";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { Trash2, Lock, Eye } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { SecretInfo } from "@/generated/types";
import { ResourceList } from "./ResourceList";
import { ResourceType } from "@/lib/resource-registry";
import { queryKeys } from "@/lib/query-keys";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import { STALE_TIMES } from "@/lib/refresh";
import {
  createNamespaceColumn,
  createAgeColumn,
  createDataKeysColumn,
} from "./columns";
import { getResourceRowId } from "@/lib/table-utils";
import type { QuickAction } from "@/components/ui/quick-actions";

const getSecretTypeColor = (type: string): string => {
  switch (type) {
    case "kubernetes.io/tls":
      return "bg-blue-500/20 text-blue-500";
    case "kubernetes.io/dockerconfigjson":
      return "bg-purple-500/20 text-purple-500";
    case "kubernetes.io/service-account-token":
      return "bg-green-500/20 text-green-500";
    default:
      return "bg-gray-500/20 text-gray-500";
  }
};

export function SecretList() {
  const { currentNamespace } = useClusterStore();
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<SecretInfo>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
      },
      createNamespaceColumn<SecretInfo>(),
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge className={getSecretTypeColor(row.original.type)}>
            {row.original.type.replace("kubernetes.io/", "")}
          </Badge>
        ),
      },
      createDataKeysColumn<SecretInfo>(),
      createAgeColumn<SecretInfo>(),
    ],
    []
  );

  const quickActions = useMemo<(setDeleteTarget: (item: SecretInfo) => void) => QuickAction<SecretInfo>[]>(
    () => (setDeleteTarget) => [
      {
        icon: Eye,
        label: "View Details",
        onClick: (item) => navigate(getResourceDetailUrl(ResourceType.Secret, item.name, item.namespace)),
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
    <ResourceList<SecretInfo>
      title="Secrets"
      queryKey={queryKeys.resources(ResourceType.Secret, currentNamespace)}
      getRowId={getResourceRowId}
      queryFn={async () => {
        const result = await commands.listSecrets({
          namespace: currentNamespace,
          labelSelector: null,
          fieldSelector: null,
          secretType: null,
          limit: null,
        });
        return result;
      }}
      columns={columns}
      quickActions={quickActions}
      emptyStateLabel="Secrets"
      getRowHref={(row) => getResourceDetailUrl(ResourceType.Secret, row.name, row.namespace)}
      deleteConfig={{
        mutationFn: async (item) => {
          await commands.deleteSecret(item.name, item.namespace);
        },
        invalidateQueryKeys: [queryKeys.resources(ResourceType.Secret, currentNamespace)],
        resourceType: ResourceType.Secret,
      }}
      staleTime={STALE_TIMES.resourceList}
    />
  );
}
