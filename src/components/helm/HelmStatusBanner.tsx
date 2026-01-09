import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDependenciesStore } from "@/stores/dependenciesStore";
import { Terminal, ExternalLink, RefreshCw } from "lucide-react";

interface HelmStatusBannerProps {
  className?: string;
}

export function HelmStatusBanner({ className }: HelmStatusBannerProps) {
  const { helm, isChecking, checkHelmAvailability } = useDependenciesStore();

  // Don't show banner if helm is available or not yet checked
  if (!helm || helm.available) {
    return null;
  }

  return (
    <Alert variant="default" className={cn("mb-4", className)}>
      <Terminal className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>Helm CLI not found</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => checkHelmAvailability()}
          disabled={isChecking}
          className="h-6 px-2"
        >
          <RefreshCw className={cn("h-3 w-3", isChecking && "animate-spin")} />
        </Button>
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          Helm CLI is required for install, upgrade, rollback, and uninstall
          operations. Listing releases will still work using the Kubernetes API.
        </p>
        {helm.error && (
          <p className="text-xs text-muted-foreground">
            Error: {helm.error}
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://helm.sh/docs/intro/install/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Install Helm
            </a>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
