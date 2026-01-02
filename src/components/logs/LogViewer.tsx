import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { Spinner } from "@/components/ui/spinner";
import {
  Download,
  Pause,
  Play,
  Search,
  Trash2,
  ArrowDown,
} from "lucide-react";
import * as commands from "@/generated/commands";
import type { LogLine, StreamLogConfig } from "@/generated/types";
import { normalizeTauriError, isPremiumFeatureError } from "@/lib/error-utils";

interface LogViewerProps {
  podName: string;
  namespace: string;
  containers: string[];
  initialContainer?: string;
  onPodNotFound?: () => void;
}

export function LogViewer({
  podName,
  namespace,
  containers,
  initialContainer,
  onPodNotFound,
}: LogViewerProps) {
  const { toast } = useToast();
  const [selectedContainer, setSelectedContainer] = useState(
    initialContainer || containers[0]
  );
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tailLines, setTailLines] = useState(100);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const streamIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Filter logs based on search
  const filteredLogs = searchQuery
    ? logs.filter((log) =>
        log.message.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : logs;

  // Get the actual scroll viewport element
  const getViewport = useCallback(() => {
    return scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement | null;
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll) {
      const viewport = getViewport();
      if (viewport) {
        // Use requestAnimationFrame for smooth scrolling
        requestAnimationFrame(() => {
          viewport.scrollTo({
            top: viewport.scrollHeight,
            behavior: "smooth",
          });
        });
      }
    }
  }, [logs, autoScroll, getViewport]);

  // Track scroll position to detect if user scrolled away from bottom
  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const atBottom = scrollHeight - scrollTop - clientHeight < 50;
      setIsAtBottom(atBottom);

      // If user scrolls to bottom manually, re-enable auto-scroll
      if (atBottom && !autoScroll) {
        setAutoScroll(true);
      }
      // If user scrolls up, disable auto-scroll
      if (!atBottom && autoScroll) {
        setAutoScroll(false);
      }
    };

    viewport.addEventListener("scroll", handleScroll);
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [autoScroll, getViewport]);

  // Scroll to bottom function for manual trigger
  const scrollToBottom = useCallback(() => {
    const viewport = getViewport();
    if (viewport) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: "smooth",
      });
      setAutoScroll(true);
    }
  }, [getViewport]);

  // Start streaming logs
  const startStreaming = useCallback(async () => {
    if (isConnecting || isStreaming) return;

    try {
      setIsConnecting(true);
      setError(null);

      console.log("Starting log stream for", podName, selectedContainer);

      const config: StreamLogConfig = {
        podName: podName,
        namespace,
        container: selectedContainer,
        tailLines: tailLines,
        follow: true,
        timestamps: true,
        previous: false,
        sinceSeconds: null,
      };

      const streamId = await commands.streamPodLogs(config);

      console.log("Got stream ID:", streamId);
      streamIdRef.current = streamId;

      // Listen for log events
      const unlisten = await listen<{
        stream_id: string;
        line: string;
        pod: string;
        container: string;
        message: string;
        timestamp: string | null;
      }>("log-line", (event) => {
        if (event.payload.stream_id === streamId) {
          setLogs((prev) => [
            ...prev,
            {
              timestamp: event.payload.timestamp,
              message: event.payload.message,
              level: null, // Event doesn't currently provide level
              pod: event.payload.pod,
              container: event.payload.container,
              namespace,
            },
          ]);
        }
      });

      unlistenRef.current = unlisten;
      setIsStreaming(true);
      setIsConnecting(false);
    } catch (err) {
      console.error("Failed to start log streaming:", err);
      const errorMsg = normalizeTauriError(err);

      // Check if this is a premium feature error
      if (isPremiumFeatureError(errorMsg)) {
        setError(
          "Log streaming is a premium feature. Please activate your license to use real-time log streaming."
        );
        setIsConnecting(false);
        setIsStreaming(false);
        return;
      }

      // Check if pod was not found
      const isPodNotFound =
        errorMsg.includes("not found") || errorMsg.includes("NotFound");

      setError(errorMsg);
      setIsConnecting(false);
      setIsStreaming(false);

      if (isPodNotFound && onPodNotFound) {
        onPodNotFound();
      } else {
        toast({
          title: "Log streaming failed",
          description: errorMsg,
          variant: "destructive",
        });
      }
    }
  }, [
    podName,
    namespace,
    selectedContainer,
    tailLines,
    isConnecting,
    isStreaming,
    toast,
    onPodNotFound,
  ]);

  const stopStreaming = useCallback(async () => {
    // Unlisten from events first
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    if (streamIdRef.current) {
      try {
        await commands.stopLogStream(streamIdRef.current);
      } catch (err) {
        console.error("Failed to stop log streaming:", err);
      }
      streamIdRef.current = null;
    }
    setIsStreaming(false);
    setIsConnecting(false);
  }, []);

  const toggleStreaming = () => {
    if (isStreaming) {
      stopStreaming();
    } else {
      startStreaming();
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const downloadLogs = async () => {
    try {
      const logs = await commands.getPodLogs(
        podName,
        namespace,
        selectedContainer,
        10000,
        null,
        false
      );

      const content = logs
        .map((log) => `${log.timestamp || ""} ${log.message}`)
        .join("\n");
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${podName}-${selectedContainer}-logs.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download logs:", error);
    }
  };

  // Auto-start streaming on mount
  useEffect(() => {
    startStreaming();

    return () => {
      stopStreaming();
    };
  }, []); // Only run on mount/unmount

  // Restart streaming when container changes
  useEffect(() => {
    if (isStreaming) {
      stopStreaming().then(() => {
        setLogs([]);
        startStreaming();
      });
    } else {
      setLogs([]);
    }
  }, [selectedContainer]);

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return "--:--:--";
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-muted/50">
        <Select value={selectedContainer} onValueChange={setSelectedContainer}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select container" />
          </SelectTrigger>
          <SelectContent>
            {containers.map((container) => (
              <SelectItem key={container} value={container}>
                {container}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select
          value={tailLines.toString()}
          onValueChange={(v) => setTailLines(parseInt(v))}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="100">100 lines</SelectItem>
            <SelectItem value="500">500 lines</SelectItem>
            <SelectItem value="1000">1000 lines</SelectItem>
            <SelectItem value="5000">5000 lines</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant={autoScroll ? "secondary" : "ghost"}
            size="icon"
            onClick={scrollToBottom}
            title={autoScroll ? "Auto-scroll enabled" : "Scroll to bottom"}
          >
            <ArrowDown
              className={`h-4 w-4 ${!isAtBottom ? "animate-bounce" : ""}`}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearLogs}
            title="Clear logs"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={downloadLogs}
            title="Download logs"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant={isStreaming ? "destructive" : "default"}
            size="sm"
            onClick={toggleStreaming}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <>
                <Spinner size="sm" className="mr-1" />
                Connecting
              </>
            ) : isStreaming ? (
              <>
                <Pause className="h-4 w-4 mr-1" />
                Stop
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1" />
                Stream
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Log content */}
      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        <div
          className="p-4 font-mono text-xs leading-relaxed"
          style={{ minHeight: "100%" }}
        >
          {error ? (
            <div className="text-center py-8">
              <p className="text-destructive mb-2">Failed to stream logs</p>
              <p className="text-muted-foreground text-xs mb-4">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null);
                  startStreaming();
                }}
              >
                Retry
              </Button>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {isConnecting
                ? "Connecting to log stream..."
                : isStreaming
                  ? "Waiting for logs..."
                  : 'Click "Stream" to start viewing logs'}
            </div>
          ) : (
            filteredLogs.map((log, index) => (
              <div
                key={index}
                className="flex gap-3 hover:bg-muted/50 py-0.5 px-1 rounded"
              >
                <span className="text-muted-foreground shrink-0 w-20">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className="whitespace-pre-wrap break-all">
                  {searchQuery ? (
                    <HighlightedText text={log.message} query={searchQuery} />
                  ) : (
                    log.message
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1 text-xs text-muted-foreground border-t bg-muted/30">
        <span>
          {filteredLogs.length} {filteredLogs.length === 1 ? "line" : "lines"}
          {searchQuery && logs.length !== filteredLogs.length && (
            <span> (filtered from {logs.length})</span>
          )}
        </span>
        {isStreaming && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Streaming
          </span>
        )}
      </div>
    </div>
  );
}

// Helper component to highlight search matches
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const parts = text.split(new RegExp(`(${query})`, "gi"));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            className="bg-yellow-500/30 text-foreground rounded px-0.5"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}
