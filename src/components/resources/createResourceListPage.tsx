/**
 * Resource list page factory.
 *
 * Most resource list pages share the same structure: pull `currentNamespace`
 * from the cluster store, define columns + quick actions, wire up
 * `<ResourceList>` with the right `queryKey`, fetcher, and delete config.
 *
 * `createResourceListPage` collapses that boilerplate into a single config
 * object. A typical list page goes from ~80 LOC to ~15 LOC.
 *
 * Example:
 * ```tsx
 * export const ConfigMapList = createResourceListPage<ConfigMapInfo>({
 *   resourceType: ResourceType.ConfigMap,
 *   title: "ConfigMaps",
 *   fetcher: ({ namespace }) =>
 *     commands.listConfigmaps({
 *       namespace,
 *       labelSelector: null,
 *       fieldSelector: null,
 *       limit: null,
 *     }),
 *   deleter: (item) => commands.deleteConfigmap(item.name, item.namespace),
 *   columns: () => [...],
 * });
 * ```
 */

import { useMemo } from "react";
import { useNavigate, type NavigateFunction } from "react-router-dom";
import { Trash2, Eye } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { ResourceList } from "./ResourceList";
import { useClusterStore } from "@/stores/clusterStore";
import { queryKeys } from "@/lib/query-keys";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import { STALE_TIMES } from "@/lib/refresh";
import { getResourceRowId } from "@/lib/table-utils";
import type { ResourceKind } from "@/lib/resource-registry";
import type { QuickAction } from "@/components/ui/quick-actions";

/** A resource that can show up in a list page. */
type ListableResource = { name: string; namespace?: string | null };

export interface ResourceListPageConfig<T extends ListableResource> {
  /** Kubernetes resource type — used for query keys + detail URLs. */
  resourceType: ResourceKind;
  /** Page title (also used as the empty-state label by default). */
  title: string;
  /** Async fetch the list. `namespace` is `null` for cluster-scoped pages. */
  fetcher: (params: { namespace: string | null }) => Promise<T[]>;
  /**
   * Optional delete function. When provided a Trash2 quick action and the
   * confirm dialog wiring activate automatically.
   */
  deleter?: (item: T) => Promise<unknown>;
  /** Build column definitions. Receives navigate so columns can link. */
  columns: (deps: { navigate: NavigateFunction }) => ColumnDef<T>[];
  /** Extra quick actions, inserted between the default View and Delete. */
  extraActions?: (deps: { navigate: NavigateFunction }) => QuickAction<T>[];
  /**
   * Cluster-scoped pages set `scope: "cluster"` so the fetcher receives
   * `namespace: null` regardless of the user's current namespace.
   */
  scope?: "namespaced" | "cluster";
  /** Override the empty-state label (defaults to `title`). */
  emptyStateLabel?: string;
  /**
   * Optional description rendered under the title. May be a string or a
   * function that receives the resolved namespace (useful for namespace-
   * aware lines like "in {namespace}").
   */
  description?: string | ((deps: { namespace: string | null }) => string);
  /** Search key (column accessor) for the in-page search box. */
  searchKey?: string;
}

export function createResourceListPage<T extends ListableResource>(
  config: ResourceListPageConfig<T>
) {
  const ListPage = function ResourceListPage() {
    const currentNamespace = useClusterStore((s) => s.currentNamespace);
    const navigate = useNavigate();
    const namespace = config.scope === "cluster" ? null : currentNamespace;

    const columns = useMemo(() => config.columns({ navigate }), [navigate]);

    const quickActions = useMemo(
      () =>
        (setDeleteTarget: (item: T) => void): QuickAction<T>[] => {
          const actions: QuickAction<T>[] = [
            {
              icon: Eye,
              label: "View Details",
              onClick: (item) =>
                navigate(
                  getResourceDetailUrl(
                    config.resourceType,
                    item.name,
                    item.namespace
                  )
                ),
            },
            ...(config.extraActions?.({ navigate }) ?? []),
          ];

          if (config.deleter) {
            actions.push({
              icon: Trash2,
              label: "Delete",
              onClick: (item) => setDeleteTarget(item),
              variant: "destructive",
            });
          }

          return actions;
        },
      [navigate]
    );

    const deleter = config.deleter;
    return (
      <ResourceList<T>
        title={config.title}
        description={
          typeof config.description === "function"
            ? config.description({ namespace })
            : config.description
        }
        searchKey={config.searchKey}
        queryKey={queryKeys.resources(config.resourceType, namespace)}
        getRowId={getResourceRowId}
        queryFn={() => config.fetcher({ namespace })}
        columns={columns}
        quickActions={quickActions}
        emptyStateLabel={config.emptyStateLabel ?? config.title}
        getRowHref={(row) =>
          getResourceDetailUrl(config.resourceType, row.name, row.namespace)
        }
        deleteConfig={
          deleter
            ? {
                mutationFn: async (item) => {
                  await deleter(item);
                },
                invalidateQueryKeys: [
                  queryKeys.resources(config.resourceType, namespace),
                ],
                resourceType: config.resourceType,
              }
            : undefined
        }
        staleTime={STALE_TIMES.resourceList}
      />
    );
  };
  ListPage.displayName = `${config.resourceType}List`;
  return ListPage;
}
