import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { MetricsStatus } from "@/generated/types";
import { AlertTriangle, ShieldAlert, Wrench } from "lucide-react";

interface MetricsStatusBannerProps {
  status?: MetricsStatus | null;
  className?: string;
}

export function MetricsStatusBanner({
  status,
  className,
}: MetricsStatusBannerProps) {
  if (!status || status.status === "available") {
    return null;
  }

  const details = status.message?.trim();

  const config = (() => {
    switch (status.status) {
      case "notInstalled":
        return {
          title: "Metrics server not installed",
          description: "Install metrics-server to see CPU and memory usage.",
          icon: Wrench,
          variant: "default" as const,
        };
      case "forbidden":
        return {
          title: "Metrics API access denied",
          description:
            "Your account cannot read metrics. Check RBAC for metrics.k8s.io.",
          icon: ShieldAlert,
          variant: "destructive" as const,
        };
      case "error":
      default:
        return {
          title: "Metrics API error",
          description: "Failed to load metrics from the cluster.",
          icon: AlertTriangle,
          variant: "destructive" as const,
        };
    }
  })();

  const description = details
    ? `${config.description} Details: ${details}`
    : config.description;

  const Icon = config.icon;

  return (
    <Alert variant={config.variant} className={cn("mb-4", className)}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{config.title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
