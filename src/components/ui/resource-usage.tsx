// Component for displaying resource usage with progress bar

import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatResourceUsage,
  calculateUtilizationPercentage,
  getUtilizationColor,
  parseKubernetesCPU,
  parseKubernetesMemory,
} from "@/lib/resource-utils";

interface ResourceUsageProps {
  used: string | null | undefined;      // "500m" or "512Mi" or bytes string
  total: string | null | undefined;     // "2" or "4Gi" or bytes string
  type: "cpu" | "memory";
  showProgressBar?: boolean;
  className?: string;
}

export function ResourceUsage({
  used,
  total,
  type,
  showProgressBar = true,
  className,
}: ResourceUsageProps) {
  const usedNum = type === "cpu"
    ? parseKubernetesCPU(used)
    : parseKubernetesMemory(used);
  const totalNum = type === "cpu"
    ? parseKubernetesCPU(total)
    : parseKubernetesMemory(total);
  
  const percentage = calculateUtilizationPercentage(usedNum, totalNum);
  const colorVariant = getUtilizationColor(percentage);
  
  const usageText = formatResourceUsage(used, total, type);
  
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{usageText}</span>
        {percentage !== null && (
          <Badge variant={colorVariant} className="text-xs">
            {percentage.toFixed(1)}%
          </Badge>
        )}
      </div>
      {showProgressBar && percentage !== null && (
        <Progress
          value={percentage}
          className={cn(
            "h-2",
            percentage >= 90 && "bg-destructive/20",
            percentage >= 70 && percentage < 90 && "bg-yellow-500/20"
          )}
        />
      )}
    </div>
  );
}

