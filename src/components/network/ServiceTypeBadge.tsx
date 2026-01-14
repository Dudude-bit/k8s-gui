import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ServiceTypeBadgeProps {
  type: string;
}

const typeConfig: Record<string, { color: string; description: string }> = {
  ClusterIP: {
    color: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    description: "Internal only - accessible within cluster",
  },
  NodePort: {
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    description: "External via node ports",
  },
  LoadBalancer: {
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    description: "External via load balancer",
  },
  ExternalName: {
    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    description: "DNS alias to external service",
  },
};

export function ServiceTypeBadge({ type }: ServiceTypeBadgeProps) {
  const config = typeConfig[type] || {
    color: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    description: "Unknown service type",
  };

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge variant="default" className={config.color}>
          {type}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{config.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
