import { Routes, Route } from "react-router-dom";
import { PodList } from "@/components/resources/PodList";
import { DeploymentList } from "@/components/resources/DeploymentList";
import { StatefulSetList } from "@/components/resources/StatefulSetList";
import { DaemonSetList } from "@/components/resources/DaemonSetList";
import { JobList } from "@/components/resources/JobList";
import { CronJobList } from "@/components/resources/CronJobList";

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
