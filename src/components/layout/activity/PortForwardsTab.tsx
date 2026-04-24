import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Play,
  Square,
  Plus,
  Settings,
  Circle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { usePortForwardStore } from "@/stores/portForwardStore";
import { useClusterStore } from "@/stores/clusterStore";
import { cn } from "@/lib/utils";

interface PortForwardsTabProps {
  onClose?: () => void;
}

export function PortForwardsTab({ onClose }: PortForwardsTabProps) {
  const navigate = useNavigate();
  const currentContext = useClusterStore((state) => state.currentContext);
  const {
    configs,
    sessions,
    statusBySession,
    startConfig,
    stopSession,
    configsLoaded,
    refreshConfigs,
  } = usePortForwardStore();

  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  // Filter configs for current context
  const contextConfigs = configs.filter(
    (config) => config.context === currentContext
  );

  // Create a map of active sessions by config key
  const sessionByKey = new Map(
    sessions.map((session) => [
      `${session.context}:${session.pod}:${session.namespace}:${session.localPort}:${session.remotePort}`,
      session,
    ])
  );

  const getConfigKey = (config: typeof configs[0]) =>
    `${config.context}:${config.pod}:${config.namespace}:${config.localPort}:${config.remotePort}`;

  const handleStart = async (configId: string) => {
    setLoadingIds((prev) => new Set(prev).add(configId));
    try {
      await startConfig(configId);
    } catch (error) {
      console.error("Failed to start port forward:", error);
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(configId);
        return next;
      });
    }
  };

  const handleStop = async (sessionId: string) => {
    setLoadingIds((prev) => new Set(prev).add(sessionId));
    try {
      await stopSession(sessionId);
    } catch (error) {
      console.error("Failed to stop port forward:", error);
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  };

  const goToSettings = () => {
    onClose?.();
    navigate("/settings");
  };

  if (!currentContext) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p>Connect to a cluster to manage port forwards</p>
      </div>
    );
  }

  if (!configsLoaded) {
    refreshConfigs();
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active Sessions */}
      {sessions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Active Sessions
          </h4>
          <ScrollArea className="max-h-[200px]">
            <div className="space-y-2">
              {sessions.map((session) => {
                const status = statusBySession[session.id];
                const isLoading = loadingIds.has(session.id);
                const isError = status?.status === "error";
                const isReconnecting =
                  status?.status === "reconnecting" ||
                  status?.status === "reconnected";

                return (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Circle
                        className={cn(
                          "h-2 w-2 flex-shrink-0",
                          isError
                            ? "fill-destructive text-destructive"
                            : isReconnecting
                            ? "fill-yellow-500 text-yellow-500"
                            : "fill-green-500 text-green-500"
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {session.pod}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {session.namespace} • :{session.localPort} →{" "}
                          :{session.remotePort}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={() => handleStop(session.id)}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Saved Configs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-muted-foreground">
            Saved Configs
          </h4>
          <Badge variant="secondary" className="text-xs">
            {contextConfigs.length}
          </Badge>
        </div>

        {contextConfigs.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <p>No port forwards configured</p>
            <p className="text-xs mt-1">
              Create one in Settings or from a Pod
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[250px]">
            <div className="space-y-2">
              {contextConfigs.map((config) => {
                const key = getConfigKey(config);
                const activeSession = sessionByKey.get(key);
                const isActive = !!activeSession;
                const isLoading = loadingIds.has(config.id);

                return (
                  <div
                    key={config.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {config.name}
                        </p>
                        {config.autoStart && (
                          <Badge variant="outline" className="text-xs">
                            Auto
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {config.pod} • :{config.localPort} → :{config.remotePort}
                      </p>
                    </div>
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={() =>
                        isActive
                          ? handleStop(activeSession.id)
                          : handleStart(config.id)
                      }
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isActive ? (
                        <Square className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={goToSettings}
        >
          <Plus className="h-4 w-4 mr-1" />
          New
        </Button>
        <Button variant="outline" size="sm" onClick={goToSettings}>
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
