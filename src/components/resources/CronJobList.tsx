import type { ColumnDef } from "@tanstack/react-table";

import type { CronJobInfo } from "@/generated/types";
import { commands } from "@/lib/commands";
import { ResourceType } from "@/lib/resource-registry";
import { getResourceListUrl } from "@/lib/navigation-utils";
import { matchCronJobPods, type ResourceMetrics } from "@/lib/metrics";
import { Badge } from "@/components/ui/badge";
import { RealtimeAge } from "@/components/ui/realtime/realtime-age";
import {
  createNameColumn,
  createNamespaceColumn,
  createAgeColumn,
  createCpuColumn,
  createMemoryColumn,
} from "./columns";
import { createWorkloadListPage } from "./createWorkloadListPage";

type CronJobInfoWithMetrics = CronJobInfo & ResourceMetrics;

const columns = (): ColumnDef<CronJobInfoWithMetrics>[] => [
  createNameColumn<CronJobInfoWithMetrics>(
    getResourceListUrl(ResourceType.CronJob)
  ),
  createNamespaceColumn<CronJobInfoWithMetrics>(),
  createCpuColumn<CronJobInfoWithMetrics>(),
  createMemoryColumn<CronJobInfoWithMetrics>(),
  { accessorKey: "schedule", header: "Schedule" },
  {
    id: "suspend",
    header: "Suspend",
    cell: ({ row }) => (
      <Badge variant={row.original.suspend ? "destructive" : "secondary"}>
        {row.original.suspend ? "Yes" : "No"}
      </Badge>
    ),
  },
  {
    id: "active",
    header: "Active",
    cell: ({ row }) => row.original.active,
  },
  {
    id: "last_schedule",
    header: "Last Schedule",
    cell: ({ row }) =>
      row.original.lastSchedule ? (
        <>
          <RealtimeAge timestamp={row.original.lastSchedule} /> ago
        </>
      ) : (
        "Never"
      ),
  },
  createAgeColumn<CronJobInfoWithMetrics>(),
];

export const CronJobList = createWorkloadListPage<CronJobInfo>({
  resourceType: ResourceType.CronJob,
  title: "CronJobs",
  fetchList: ({ namespace }) =>
    commands.listCronjobs({
      namespace,
      labelSelector: null,
      fieldSelector: null,
      limit: null,
    }),
  matchPods: matchCronJobPods,
  deleter: (item) => commands.deleteCronjob(item.name, item.namespace),
  columns,
});
