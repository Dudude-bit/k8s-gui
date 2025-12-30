import { Handle, NodeProps, Position } from "reactflow";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ResourceNodeData } from "@/features/infrastructure/types";

const KIND_BADGE_CLASS: Record<ResourceNodeData["kind"], string> = {
  Pod: "badge-pod",
  Deployment: "badge-deployment",
  Service: "badge-service",
  Ingress: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  ConfigMap: "badge-configmap",
  Secret: "badge-secret",
};

export function ResourceNode({ data, selected }: NodeProps<ResourceNodeData>) {
  const showSourceHandle = data.kind === "Ingress" || data.kind === "Service";
  const showTargetHandle =
    data.kind === "Service" ||
    data.kind === "Pod" ||
    data.kind === "Deployment";

  return (
    <div
      className={cn(
        "min-w-[170px] rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm",
        selected && "ring-2 ring-primary"
      )}
    >
      {showTargetHandle && (
        <Handle
          type="target"
          position={Position.Left}
          className="h-2 w-2 bg-muted-foreground"
        />
      )}
      {showSourceHandle && (
        <Handle
          type="source"
          position={Position.Right}
          className="h-2 w-2 bg-muted-foreground"
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            className={cn("text-[10px] uppercase", KIND_BADGE_CLASS[data.kind])}
          >
            {data.kind}
          </Badge>
          {data.origin === "cluster" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[10px] uppercase">
                  Imported
                </Badge>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="center"
                className="max-w-xs text-xs"
              >
                Imported resources are excluded from Apply/Validate unless you
                enable “Include imported”.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {data.status ?? "Idle"}
        </span>
      </div>
      <div className="mt-2 space-y-1">
        <div className="truncate text-sm font-semibold">{data.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {data.namespace || "default"}
        </div>
      </div>
    </div>
  );
}
