import { Routes, Route } from 'react-router-dom';
import { PodList } from '@/components/resources/PodList';
import { DeploymentList } from '@/components/resources/DeploymentList';

export function Workloads() {
  return (
    <Routes>
      <Route path="pods" element={<PodList />} />
      <Route path="deployments" element={<DeploymentList />} />
      <Route path="statefulsets" element={<PlaceholderPage title="StatefulSets" />} />
      <Route path="daemonsets" element={<PlaceholderPage title="DaemonSets" />} />
      <Route path="jobs" element={<PlaceholderPage title="Jobs" />} />
      <Route path="cronjobs" element={<PlaceholderPage title="CronJobs" />} />
      <Route index element={<PodList />} />
    </Routes>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">
        This page is under construction.
      </p>
    </div>
  );
}
