import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Terminal,
  Circle,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { useTerminalSessionStore } from "@/stores/terminalSessionStore";
import { useClusterStore } from "@/stores/clusterStore";
import { cn } from "@/lib/utils";
import { formatAge } from "@/lib/utils";
import { ResourceType } from "@/lib/resource-registry";

interface TerminalsTabProps {
  onClose?: () => void;
}

export function TerminalsTab({ onClose }: TerminalsTabProps) {
  const navigate = useNavigate();
  const currentContext = useClusterStore((state) => state.currentContext);
  const sessions = useTerminalSessionStore((state) => state.sessions);

  // Filter sessions for current context
  const contextSessions = sessions.filter(
    (session) => session.context === currentContext
  );

  const handleNavigateToPod = (namespace: string, podName: string) => {
    onClose?.();
    navigate(`/${ResourceType.Pod}/${namespace}/${podName}`);
  };

  if (!currentContext) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p>Connect to a cluster to view terminals</p>
      </div>
    );
  }

  if (contextSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <Terminal className="h-8 w-8 mb-2 opacity-50" />
        <p>No active terminal sessions</p>
        <p className="text-xs mt-1">
          Open a terminal from any Pod detail page
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">
          Active Terminals
        </h4>
        <Badge variant="secondary" className="text-xs">
          {contextSessions.length}
        </Badge>
      </div>

      <ScrollArea className="max-h-[400px]">
        <div className="space-y-2">
          {contextSessions.map((session) => {
            const isConnected = session.status === "connected";
            const isError = session.status === "error";
            const isConnecting = session.status === "connecting";

            return (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() =>
                  handleNavigateToPod(session.namespace, session.podName)
                }
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <Terminal className="h-4 w-4 text-muted-foreground" />
                    <Circle
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-2 w-2",
                        isConnected
                          ? "fill-green-500 text-green-500"
                          : isError
                          ? "fill-destructive text-destructive"
                          : isConnecting
                          ? "fill-yellow-500 text-yellow-500"
                          : "fill-muted text-muted"
                      )}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {session.podName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {session.namespace} • {session.containerName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatAge(session.createdAt)}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {contextSessions.some((s) => s.status === "error") && (
        <p className="text-xs text-destructive">
          Some sessions have errors. Click to reconnect.
        </p>
      )}
    </div>
  );
}
