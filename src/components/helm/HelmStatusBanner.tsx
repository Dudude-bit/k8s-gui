import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDependenciesStore } from "@/stores/dependenciesStore";
import { Terminal, Settings, RefreshCw, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

interface HelmStatusBannerProps {
  className?: string;
  /** Show minimal version (just the warning, no details) */
  minimal?: boolean;
}

export function HelmStatusBanner({ className, minimal = false }: HelmStatusBannerProps) {
  const { helm, isChecking, checkHelmAvailability } = useDependenciesStore();

  // Don't show banner if helm is available or not yet checked
  if (!helm || helm.available) {
    return null;
  }

  if (minimal) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-500", className)}>
        <AlertTriangle className="h-4 w-4" />
        <span>Helm CLI not found.</span>
        <Link to="/settings" className="underline hover:no-underline">
          Configure in Settings
        </Link>
      </div>
    );
  }

  return (
    <Alert variant="default" className={cn("mb-4 border-yellow-500/50 bg-yellow-500/5", className)}>
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
      <AlertDescription className="space-y-3">
        <p>
          The following features require Helm CLI and are currently disabled:
        </p>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
          <li>Search and install charts from repositories</li>
          <li>Upgrade existing releases</li>
          <li>Rollback to previous revisions</li>
          <li>Uninstall releases</li>
          <li>Manage Helm repositories</li>
        </ul>
        <p className="text-sm">
          <strong>Note:</strong> Viewing releases and their details still works using the Kubernetes API.
        </p>
        {helm.error && (
          <p className="text-xs text-muted-foreground">
            Error: {helm.error}
          </p>
        )}
        <div className="flex gap-2 mt-3">
          <Button variant="default" size="sm" asChild>
            <Link to="/settings" className="inline-flex items-center gap-1">
              <Settings className="h-3 w-3" />
              Configure in Settings
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://helm.sh/docs/intro/install/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1"
            >
              Install Helm
            </a>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
