import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { Users, Circle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { commands } from "@/lib/commands";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import { ResourceType } from "@/lib/resource-registry";

interface MatchingPodsProps {
  namespace: string;
  selector: Record<string, string>;
}

function getPodStatusColor(phase: string): string {
  switch (phase) {
    case "Running":
      return "text-green-500";
    case "Pending":
      return "text-yellow-500";
    case "Succeeded":
      return "text-blue-500";
    case "Failed":
      return "text-red-500";
    default:
      return "text-gray-500";
  }
}

export function MatchingPods({ namespace, selector }: MatchingPodsProps) {
  const { data: pods, isLoading, error } = useQuery({
    queryKey: ["pods-by-selector", namespace, selector],
    queryFn: () => commands.getPodsBySelector(namespace, selector),
    enabled: Object.keys(selector).length > 0,
  });

  if (Object.keys(selector).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Matching Pods
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No selector defined</p>
        </CardContent>
      </Card>
    );
  }

  // Count pods by status
  const statusCounts = pods?.reduce((acc, pod) => {
    const phase = pod.status.phase || "Unknown";
    acc[phase] = (acc[phase] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const statusSummary = Object.entries(statusCounts)
    .map(([phase, count]) => `${count} ${phase.toLowerCase()}`)
    .join(", ");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Matching Pods
          {pods && pods.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {statusSummary}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <p className="text-destructive">Failed to load pods: {String(error)}</p>
        ) : pods && pods.length > 0 ? (
          <div className="space-y-2">
            {pods.map((pod) => (
              <Link
                key={pod.uid}
                to={getResourceDetailUrl(ResourceType.Pod, pod.name, pod.namespace)}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Circle
                    className={`h-3 w-3 fill-current ${getPodStatusColor(pod.status.phase || "Unknown")}`}
                  />
                  <span className="font-medium">{pod.name}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{pod.status.phase}</span>
                  {pod.podIp && <code className="font-mono text-xs">{pod.podIp}</code>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No pods match this selector</p>
        )}
      </CardContent>
    </Card>
  );
}
