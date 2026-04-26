import type { ColumnDef } from "@tanstack/react-table";

import type { DaemonSetInfo } from "@/generated/types";
import { commands } from "@/lib/commands";
import { ResourceType } from "@/lib/resource-registry";
import { getResourceListUrl } from "@/lib/navigation-utils";
import { matchDaemonSetPods, type ResourceMetrics } from "@/lib/metrics";
import {
  createNameColumn,
  createNamespaceColumn,
  createAgeColumn,
  createCpuColumn,
  createMemoryColumn,
} from "./columns";
import { createWorkloadListPage } from "./createWorkloadListPage";

type DaemonSetInfoWithMetrics = DaemonSetInfo & ResourceMetrics;

const columns = (): ColumnDef<DaemonSetInfoWithMetrics>[] => [
  createNameColumn<DaemonSetInfoWithMetrics>(
    getResourceListUrl(ResourceType.DaemonSet)
  ),
  createNamespaceColumn<DaemonSetInfoWithMetrics>(),
  createCpuColumn<DaemonSetInfoWithMetrics>(),
  createMemoryColumn<DaemonSetInfoWithMetrics>(),
  {
    id: "desired",
    header: "Desired",
    cell: ({ row }) => row.original.desired,
  },
  {
    id: "current",
    header: "Current",
    cell: ({ row }) => row.original.current,
  },
  {
    id: "ready",
    header: "Ready",
    cell: ({ row }) => {
      const { ready, desired } = row.original;
      return (
        <span
          className={ready === desired ? "text-green-500" : "text-yellow-500"}
        >
          {ready}
        </span>
      );
    },
  },
  createAgeColumn<DaemonSetInfoWithMetrics>(),
];

export const DaemonSetList = createWorkloadListPage<DaemonSetInfo>({
  resourceType: ResourceType.DaemonSet,
  title: "DaemonSets",
  fetchList: ({ namespace }) =>
    commands.listDaemonsets({
      namespace,
      labelSelector: null,
      fieldSelector: null,
      limit: null,
    }),
  matchPods: matchDaemonSetPods,
  deleter: (item) => commands.deleteDaemonset(item.name, item.namespace),
  columns,
});
