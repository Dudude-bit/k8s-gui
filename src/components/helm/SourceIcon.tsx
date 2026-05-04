import { Anchor, Package } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function SourceIcon({ source }: { source: string }) {
  if (source === "flux") {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Anchor className="h-4 w-4 text-purple-500" />
        </TooltipTrigger>
        <TooltipContent>Flux CD HelmRelease</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger>
        <Package className="h-4 w-4 text-blue-500" />
      </TooltipTrigger>
      <TooltipContent>Native Helm Release</TooltipContent>
    </Tooltip>
  );
}
