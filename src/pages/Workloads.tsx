import { Routes, Route } from "react-router-dom";
import { PodList } from "@/components/resources/PodList";
import { DeploymentList } from "@/components/resources/DeploymentList";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { ColumnDef } from "@tanstack/react-table";
import { RefreshCw, Loader2 } from "lucide-react";
import { formatAge, getStatusColor } from "@/lib/utils";

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

// ============= StatefulSets =============
interface StatefulSetInfo {
  name: string;
  namespace: string;
  replicas: { desired: number; ready: number; current: number };
  created_at: string | null;
}

const statefulSetColumns: ColumnDef<StatefulSetInfo>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  { accessorKey: "namespace", header: "Namespace" },
  {
    id: "replicas",
    header: "Replicas",
    cell: ({ row }) => {
      const { ready, desired } = row.original.replicas;
      return (
        <span
          className={ready === desired ? "text-green-500" : "text-yellow-500"}
        >
          {ready}/{desired}
        </span>
      );
    },
  },
  {
    id: "age",
    header: "Age",
    cell: ({ row }) => formatAge(row.original.created_at),
  },
];

function StatefulSetList() {
  const { isConnected, currentNamespace } = useClusterStore();

  const {
    data = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["statefulsets", currentNamespace],
    queryFn: async () => {
      return invoke<StatefulSetInfo[]>("list_statefulsets", {
        namespace: currentNamespace,
      });
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="StatefulSets" />;
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">StatefulSets</h1>
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
        columns={statefulSetColumns}
        data={data}
        isLoading={isLoading && data.length === 0}
        isFetching={isFetching && !isLoading}
      />
    </div>
  );
}

// ============= DaemonSets =============
interface DaemonSetInfo {
  name: string;
  namespace: string;
  desired: number;
  current: number;
  ready: number;
  created_at: string | null;
}

const daemonSetColumns: ColumnDef<DaemonSetInfo>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  { accessorKey: "namespace", header: "Namespace" },
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
  {
    id: "age",
    header: "Age",
    cell: ({ row }) => formatAge(row.original.created_at),
  },
];

function DaemonSetList() {
  const { isConnected, currentNamespace } = useClusterStore();

  const {
    data = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["daemonsets", currentNamespace],
    queryFn: async () => {
      return invoke<DaemonSetInfo[]>("list_daemonsets", {
        namespace: currentNamespace,
      });
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="DaemonSets" />;
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">DaemonSets</h1>
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
        columns={daemonSetColumns}
        data={data}
        isLoading={isLoading && data.length === 0}
        isFetching={isFetching && !isLoading}
      />
    </div>
  );
}

// ============= Jobs =============
interface JobInfo {
  name: string;
  namespace: string;
  completions: number | null;
  succeeded: number;
  failed: number;
  active: number;
  status: string;
  created_at: string | null;
}

const jobColumns: ColumnDef<JobInfo>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  { accessorKey: "namespace", header: "Namespace" },
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
      <Badge className={getStatusColor(row.original.status)}>
        {row.original.status}
      </Badge>
    ),
  },
  {
    id: "age",
    header: "Age",
    cell: ({ row }) => formatAge(row.original.created_at),
  },
];

function JobList() {
  const { isConnected, currentNamespace } = useClusterStore();

  const {
    data = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["jobs", currentNamespace],
    queryFn: async () => {
      return invoke<JobInfo[]>("list_jobs", { namespace: currentNamespace });
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="Jobs" />;
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Jobs</h1>
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
        columns={jobColumns}
        data={data}
        isLoading={isLoading && data.length === 0}
        isFetching={isFetching && !isLoading}
      />
    </div>
  );
}

// ============= CronJobs =============
interface CronJobInfo {
  name: string;
  namespace: string;
  schedule: string;
  suspend: boolean;
  active: number;
  last_schedule: string | null;
  created_at: string | null;
}

const cronJobColumns: ColumnDef<CronJobInfo>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  { accessorKey: "namespace", header: "Namespace" },
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
      row.original.last_schedule
        ? formatAge(row.original.last_schedule) + " ago"
        : "Never",
  },
  {
    id: "age",
    header: "Age",
    cell: ({ row }) => formatAge(row.original.created_at),
  },
];

function CronJobList() {
  const { isConnected, currentNamespace } = useClusterStore();

  const {
    data = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["cronjobs", currentNamespace],
    queryFn: async () => {
      return invoke<CronJobInfo[]>("list_cronjobs", {
        namespace: currentNamespace,
      });
    },
    enabled: isConnected,
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="CronJobs" />;
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">CronJobs</h1>
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
        columns={cronJobColumns}
        data={data}
        isLoading={isLoading && data.length === 0}
        isFetching={isFetching && !isLoading}
      />
    </div>
  );
}
