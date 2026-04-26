import type { ConfigMapInfo } from "@/generated/types";
import { commands } from "@/lib/commands";
import { ResourceType } from "@/lib/resource-registry";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import {
  createNameColumn,
  createNamespaceColumn,
  createAgeColumn,
  createDataKeysColumn,
} from "./columns";
import { createResourceListPage } from "./createResourceListPage";

export const ConfigMapList = createResourceListPage<ConfigMapInfo>({
  resourceType: ResourceType.ConfigMap,
  title: "ConfigMaps",
  fetcher: ({ namespace }) =>
    commands.listConfigmaps({
      namespace,
      labelSelector: null,
      fieldSelector: null,
      limit: null,
    }),
  deleter: (item) => commands.deleteConfigmap(item.name, item.namespace),
  columns: () => [
    createNameColumn<ConfigMapInfo>(
      getResourceDetailUrl(ResourceType.ConfigMap, "", "")
    ),
    createNamespaceColumn<ConfigMapInfo>(),
    createDataKeysColumn<ConfigMapInfo>(),
    createAgeColumn<ConfigMapInfo>(),
  ],
});
