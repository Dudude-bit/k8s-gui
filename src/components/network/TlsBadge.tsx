import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Shield } from "lucide-react";

interface TlsBadgeProps {
  tlsHosts: string[];
  hasCatchAllTls: boolean;
  showIcon?: boolean;
}

export function TlsBadge({ tlsHosts, hasCatchAllTls, showIcon = false }: TlsBadgeProps) {
  const explicitCount = tlsHosts.length;
  const hasTls = explicitCount > 0 || hasCatchAllTls;

  if (!hasTls) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        No TLS
      </Badge>
    );
  }

  // Build display text
  let displayText: string;
  if (explicitCount > 0 && hasCatchAllTls) {
    displayText = `TLS (${explicitCount} + all)`;
  } else if (hasCatchAllTls) {
    displayText = "TLS (all)";
  } else {
    displayText = `TLS (${explicitCount})`;
  }

  // Build tooltip content
  const tooltipLines: string[] = [];
  if (explicitCount > 0) {
    tooltipLines.push(...tlsHosts);
  }
  if (hasCatchAllTls) {
    tooltipLines.push("+ Catch-all TLS certificate");
  }

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge
          variant="default"
          className="bg-green-500/10 text-green-500 border-green-500/20"
        >
          {showIcon && <Shield className="h-3 w-3 mr-1" />}
          {displayText}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1">
          {tooltipLines.map((line, i) => (
            <div key={i} className="text-xs">
              {line}
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
