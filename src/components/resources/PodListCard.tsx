import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RealtimeAge } from "@/components/ui/realtime";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import type { PodInfo } from "@/generated/types";

interface PodListCardProps {
  pods: PodInfo[];
  emptyMessage?: string;
}

function getStatusVariant(status: string): "success" | "warning" | "destructive" | "default" {
  switch (status) {
    case "Running":
      return "success";
    case "Succeeded":
      return "default";
    case "Pending":
      return "warning";
    default:
      return "destructive";
  }
}

export function PodListCard({ pods, emptyMessage = "No pods found" }: PodListCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-2">
          {pods.map((pod) => {
            const readyCount = pod.containers?.filter((c) => c.ready).length ?? 0;
            const totalCount = pod.containers?.length ?? 0;
            const readyText = `${readyCount}/${totalCount}`;
            const status = pod.status?.phase || "Unknown";

            return (
              <Link
                key={pod.name}
                to={`/${toPlural(ResourceType.Pod)}/${pod.namespace}/${pod.name}`}
                className="flex items-center justify-between p-3 rounded-md hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge variant={getStatusVariant(status)}>
                    {status}
                  </Badge>
                  <span className="font-medium">{pod.name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Ready: {readyText}</span>
                  <span>Restarts: {pod.restartCount ?? 0}</span>
                  <RealtimeAge timestamp={pod.createdAt} />
                </div>
              </Link>
            );
          })}
          {pods.length === 0 && (
            <p className="text-center text-muted-foreground py-4">
              {emptyMessage}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
