import { Routes, Route } from "react-router-dom";
import { PodList } from "@/components/resources/PodList";
import { DeploymentList } from "@/components/resources/DeploymentList";
import { useClusterStore } from "@/stores/clusterStore";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { ColumnDef } from "@tanstack/react-table";
import { ResourceListHeader } from "@/components/resources/ResourceListHeader";
import { formatAge } from "@/lib/utils";
import { useMemo, useCallback } from "react";
import { ResourceUsage } from "@/components/ui/resource-usage";
import {
  useResourceWithMetrics,
  matchStatefulSetPods,
  matchDaemonSetPods,
  matchJobPods,
  type ResourceWithMetrics,
} from "@/hooks/useResourceWithMetrics";
import * as commands from "@/generated/commands";
import type {
  StatefulSetInfo,
  DaemonSetInfo,
  JobInfo,
  CronJobInfo,
  PodInfo
} from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";

export function Workloads() {
  return (
    <Routes>
      <Route path="pods" element={<PodList />} />
      <Route path="deployments" element={<DeploymentList />} />
      <Route path="statefulsets" element={<StatefulSetList />} />
      <Route path="daemonsets" element={<DaemonSetList />} />
      <Route path="jobs" element={<JobList />} />
      <Route path="cronjobs" element={<CronJobList />} />
      <Route index element={<PodList />} />
    </Routes>
  );
}

// ============= Common Types =============
interface BaseResourceInfo {
  name: string;
  namespace: string;
  createdAt: string | null;
}

// ============= Generic Resource List Component =============
interface GenericResourceListProps<T extends BaseResourceInfo> {
  title: string;
  resourceLabel: string;
  columns: ColumnDef<T & ResourceWithMetrics>[];
  data: (T & ResourceWithMetrics)[];
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => void;
}

function GenericResourceList<T extends BaseResourceInfo>({
  title,
  resourceLabel,
  columns,
  data,
  isLoading,
  isFetching,
  refetch,
}: GenericResourceListProps<T>) {
  const { isConnected } = useClusterStore();

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel={resourceLabel} />;
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <ResourceListHeader
        title={title}
        isFetching={isFetching}
        isLoading={isLoading}
        onRefresh={() => refetch()}
      />
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading && data.length === 0}
        isFetching={isFetching && !isLoading}
      />
    </div>
  );
}

// ============= StatefulSets =============
function StatefulSetList() {
  const { currentNamespace } = useClusterStore();

  const { data, isLoading, isFetching, refetch } = useResourceWithMetrics<StatefulSetInfo>(
    ["statefulsets", currentNamespace],
    async () => {
      try {
        return await commands.listStatefulsets({
          namespace: currentNamespace || null,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
        });
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    useCallback(matchStatefulSetPods, [])
  );

  const columns = useMemo<ColumnDef<StatefulSetInfo & ResourceWithMetrics>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      { accessorKey: "namespace", header: "Namespace" },
      {
        id: "cpu",
        header: "CPU",
        cell: ({ row }) => (
          <ResourceUsage
            used={row.original.cpuUsage}
            total={null}
            type="cpu"
            showProgressBar={false}
          />
        ),
      },
      {
        id: "memory",
        header: "Memory",
        cell: ({ row }) => (
          <ResourceUsage
            used={row.original.memoryUsage}
            total={null}
            type="memory"
            showProgressBar={false}
          />
        ),
      },
      {
        id: "replicas",
        header: "Replicas",
        cell: ({ row }) => {
          const { ready, desired } = row.original.replicas;
          return (
            <span className={ready === desired ? "text-green-500" : "text-yellow-500"}>
              {ready}/{desired}
            </span>
          );
        },
      },
      {
        id: "age",
        header: "Age",
        cell: ({ row }) => formatAge(row.original.createdAt),
      },
    ],
    []
  );

  return (
    <GenericResourceList
      title="StatefulSets"
      resourceLabel="StatefulSets"
      columns={columns}
      data={data}
      isLoading={isLoading}
      isFetching={isFetching}
      refetch={refetch}
    />
  );
}

// ============= DaemonSets =============
function DaemonSetList() {
  const { currentNamespace } = useClusterStore();

  const { data, isLoading, isFetching, refetch } = useResourceWithMetrics<DaemonSetInfo>(
    ["daemonsets", currentNamespace],
    async () => {
      try {
        return await commands.listDaemonsets({
          namespace: currentNamespace || null,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
        });
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    useCallback(matchDaemonSetPods, [])
  );

  const columns = useMemo<ColumnDef<DaemonSetInfo & ResourceWithMetrics>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      { accessorKey: "namespace", header: "Namespace" },
      {
        id: "cpu",
        header: "CPU",
        cell: ({ row }) => (
          <ResourceUsage
            used={row.original.cpuUsage}
            total={null}
            type="cpu"
            showProgressBar={false}
          />
        ),
      },
      {
        id: "memory",
        header: "Memory",
        cell: ({ row }) => (
          <ResourceUsage
            used={row.original.memoryUsage}
            total={null}
            type="memory"
            showProgressBar={false}
          />
        ),
      },
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
            <span className={ready === desired ? "text-green-500" : "text-yellow-500"}>
              {ready}
            </span>
          );
        },
      },
      {
        id: "age",
        header: "Age",
        cell: ({ row }) => formatAge(row.original.createdAt),
      },
    ],
    []
  );

  return (
    <GenericResourceList
      title="DaemonSets"
      resourceLabel="DaemonSets"
      columns={columns}
      data={data}
      isLoading={isLoading}
      isFetching={isFetching}
      refetch={refetch}
    />
  );
}

// ============= Jobs =============
function JobList() {
  const { currentNamespace } = useClusterStore();

  const { data, isLoading, isFetching, refetch } = useResourceWithMetrics<JobInfo>(
    ["jobs", currentNamespace],
    async () => {
      try {
        return await commands.listJobs({
          namespace: currentNamespace || null,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
        });
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    useCallback(matchJobPods, [])
  );

  const columns = useMemo<ColumnDef<JobInfo & ResourceWithMetrics>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      { accessorKey: "namespace", header: "Namespace" },
      {
        id: "cpu",
        header: "CPU",
        cell: ({ row }) => (
          <ResourceUsage
            used={row.original.cpuUsage}
            total={null}
            type="cpu"
            showProgressBar={false}
          />
        ),
      },
      {
        id: "memory",
        header: "Memory",
        cell: ({ row }) => (
          <ResourceUsage
            used={row.original.memoryUsage}
            total={null}
            type="memory"
            showProgressBar={false}
          />
        ),
      },
      {
        id: "completions",
        header: "Completions",
        cell: ({ row }) =>
          `${row.original.succeeded}/${row.original.completions || "∞"}`,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge status={row.original.status} />
        ),
      },
      {
        id: "age",
        header: "Age",
        cell: ({ row }) => formatAge(row.original.createdAt),
      },
    ],
    []
  );

  return (
    <GenericResourceList
      title="Jobs"
      resourceLabel="Jobs"
      columns={columns}
      data={data}
      isLoading={isLoading}
      isFetching={isFetching}
      refetch={refetch}
    />
  );
}

// ============= CronJobs =============
function CronJobList() {
  const { currentNamespace } = useClusterStore();

  // CronJobs need to match pods via their Jobs
  const matchCronJobPods = useCallback(
    (cronJob: CronJobInfo, pod: PodInfo): boolean => {
      // CronJob pods have name pattern: {cronjob-name}-{timestamp}-{hash}
      // We match if the pod name starts with the cronjob name followed by a dash
      return (
        pod.namespace === cronJob.namespace &&
        pod.name.startsWith(cronJob.name + "-")
      );
    },
    []
  );

  const { data, isLoading, isFetching, refetch } = useResourceWithMetrics<CronJobInfo>(
    ["cronjobs", currentNamespace],
    async () => {
      try {
        return await commands.listCronjobs({
          namespace: currentNamespace || null,
          labelSelector: null,
          fieldSelector: null,
          limit: null,
        });
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    matchCronJobPods
  );

  const columns = useMemo<ColumnDef<CronJobInfo & ResourceWithMetrics>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      { accessorKey: "namespace", header: "Namespace" },
      {
        id: "cpu",
        header: "CPU",
        cell: ({ row }) => (
          <ResourceUsage
            used={row.original.cpuUsage}
            total={null}
            type="cpu"
            showProgressBar={false}
          />
        ),
      },
      {
        id: "memory",
        header: "Memory",
        cell: ({ row }) => (
          <ResourceUsage
            used={row.original.memoryUsage}
            total={null}
            type="memory"
            showProgressBar={false}
          />
        ),
      },
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
          row.original.lastSchedule
            ? formatAge(row.original.lastSchedule) + " ago"
            : "Never",
      },
      {
        id: "age",
        header: "Age",
        cell: ({ row }) => formatAge(row.original.createdAt),
      },
    ],
    []
  );

  return (
    <GenericResourceList
      title="CronJobs"
      resourceLabel="CronJobs"
      columns={columns}
      data={data}
      isLoading={isLoading}
      isFetching={isFetching}
      refetch={refetch}
    />
  );
}
