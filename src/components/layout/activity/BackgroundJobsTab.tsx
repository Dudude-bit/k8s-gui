import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  RefreshCw,
} from "lucide-react";
import {
  useBackgroundJobStore,
  type BackgroundJob,
  type BackgroundJobType,
} from "@/stores/backgroundJobStore";
import { cn } from "@/lib/utils";
import { RealtimeAge } from "@/components/ui/realtime";

const JOB_TYPE_LABELS: Record<BackgroundJobType, string> = {
  delete: "Delete",
  scale: "Scale",
  restart: "Restart",
  apply: "Apply",
  rollback: "Rollback",
  cordon: "Cordon",
  uncordon: "Uncordon",
  drain: "Drain",
};

function JobStatusIcon({ job }: { job: BackgroundJob }) {
  switch (job.status) {
    case "pending":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case "running":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-destructive" />;
  }
}

export function BackgroundJobsTab() {
  const { jobs, removeJob, clearCompleted } = useBackgroundJobStore();

  const activeJobs = jobs.filter(
    (job) => job.status === "pending" || job.status === "running"
  );
  const completedJobs = jobs.filter(
    (job) => job.status === "completed" || job.status === "failed"
  );

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <RefreshCw className="h-8 w-8 mb-2 opacity-50" />
        <p>No background jobs</p>
        <p className="text-xs mt-1">
          Operations like delete, scale, and restart will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-muted-foreground">
              In Progress
            </h4>
            <Badge variant="secondary" className="text-xs">
              {activeJobs.length}
            </Badge>
          </div>
          <ScrollArea className="max-h-[150px]">
            <div className="space-y-2">
              {activeJobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-md border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <JobStatusIcon job={job} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {JOB_TYPE_LABELS[job.type]} {job.resourceType}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {job.resourceName}
                          {job.namespace && ` • ${job.namespace}`}
                        </p>
                      </div>
                    </div>
                  </div>
                  {job.progress !== undefined && (
                    <Progress value={job.progress} className="h-1" />
                  )}
                  {job.message && (
                    <p className="text-xs text-muted-foreground truncate">
                      {job.message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Completed Jobs */}
      {completedJobs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-muted-foreground">
              Recent
            </h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={clearCompleted}
            >
              Clear
            </Button>
          </div>
          <ScrollArea className="max-h-[250px]">
            <div className="space-y-2">
              {completedJobs.map((job) => (
                <div
                  key={job.id}
                  className={cn(
                    "flex items-center justify-between rounded-md border p-3",
                    job.status === "failed" && "border-destructive/50"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <JobStatusIcon job={job} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {JOB_TYPE_LABELS[job.type]} {job.resourceType}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {job.resourceName}
                        {job.namespace && ` • ${job.namespace}`}
                      </p>
                      {job.status === "failed" && job.message && (
                        <p className="text-xs text-destructive truncate mt-1">
                          {job.message}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <RealtimeAge
                      timestamp={job.completedAt ?? job.createdAt}
                      className="text-xs text-muted-foreground"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeJob(job.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
