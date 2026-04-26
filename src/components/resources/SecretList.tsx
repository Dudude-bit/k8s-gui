import type { ColumnDef } from "@tanstack/react-table";
import { Lock } from "lucide-react";
import type { SecretInfo } from "@/generated/types";
import { commands } from "@/lib/commands";
import { ResourceType } from "@/lib/resource-registry";
import { Badge } from "@/components/ui/badge";
import {
  createNamespaceColumn,
  createAgeColumn,
  createDataKeysColumn,
} from "./columns";
import { createResourceListPage } from "./createResourceListPage";

const SECRET_TYPE_COLOR: Record<string, string> = {
  "kubernetes.io/tls": "bg-blue-500/20 text-blue-500",
  "kubernetes.io/dockerconfigjson": "bg-purple-500/20 text-purple-500",
  "kubernetes.io/service-account-token": "bg-green-500/20 text-green-500",
};

const getSecretTypeColor = (type: string): string =>
  SECRET_TYPE_COLOR[type] ?? "bg-gray-500/20 text-gray-500";

const columns = (): ColumnDef<SecretInfo>[] => [
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
];

export const SecretList = createResourceListPage<SecretInfo>({
  resourceType: ResourceType.Secret,
  title: "Secrets",
  fetcher: ({ namespace }) =>
    commands.listSecrets({
      namespace,
      labelSelector: null,
      fieldSelector: null,
      secretType: null,
      limit: null,
    }),
  deleter: (item) => commands.deleteSecret(item.name, item.namespace),
  columns,
});
