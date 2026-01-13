import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { commands } from "@/lib/commands";
import type { LogFormat, LogLevel, LogLine, StreamLogConfig } from "@/generated/types";
import { normalizeTauriError, isPremiumFeatureError } from "@/lib/error-utils";

const MAX_LOG_LINES = 5000;

interface UseLogStreamOptions {
  podName: string;
  namespace: string;
  container: string;
  tailLines: number;
  onPodNotFound?: () => void;
}

interface UseLogStreamResult {
  logs: LogLine[];
  isStreaming: boolean;
  isConnecting: boolean;
  error: string | null;
  isPaused: boolean;
  clearLogs: () => void;
  togglePause: () => void;
  retry: () => void;
}

export function useLogStream({
  podName,
  namespace,
  container,
  tailLines,
  onPodNotFound,
}: UseLogStreamOptions): UseLogStreamResult {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const streamIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setIsPaused(false);
    setRetryTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let active = true;
    let currentStreamId: string | null = null;
    let currentUnlisten: (() => void) | null = null;

    const cleanup = async () => {
      active = false;
      if (currentUnlisten) {
        currentUnlisten();
        currentUnlisten = null;
      }
      if (currentStreamId) {
        try {
          await commands.stopLogStream(currentStreamId);
        } catch (err) {
          console.error("Failed to stop log streaming:", err);
        }
        currentStreamId = null;
      }
      setIsStreaming(false);
      setIsConnecting(false);
    };

    const initStream = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!active || isPaused) return;

      try {
        setIsConnecting(true);
        setError(null);
        setLogs([]);

        const config: StreamLogConfig = {
          podName,
          namespace,
          container,
          tailLines,
          follow: true,
          timestamps: true,
          previous: false,
          sinceSeconds: null,
        };

        if (!active) {
          setIsConnecting(false);
          return;
        }

        const streamId = await commands.streamPodLogs(config);

        if (!active) {
          commands.stopLogStream(streamId).catch(console.error);
          setIsConnecting(false);
          return;
        }

        currentStreamId = streamId;
        streamIdRef.current = streamId;

        const unlisten = await listen<{
          stream_id: string;
          line: string;
          pod: string;
          container: string;
          message: string;
          timestamp: string | null;
          level: LogLevel | null;
          format: LogFormat | null;
          fields: Record<string, string> | null;
          raw: string;
        }>("log-line", (event) => {
          if (event.payload.stream_id === streamId) {
            setLogs((prev) =>
              [
                ...prev,
                {
                  timestamp: event.payload.timestamp,
                  message: event.payload.message,
                  level: event.payload.level,
                  format: event.payload.format ?? "plain",
                  fields: event.payload.fields,
                  raw: event.payload.raw || event.payload.line || event.payload.message,
                  pod: event.payload.pod,
                  container: event.payload.container,
                  namespace,
                },
              ].slice(-MAX_LOG_LINES)
            );
          }
        });

        if (!active) {
          unlisten();
          commands.stopLogStream(streamId).catch(console.error);
          setIsConnecting(false);
          return;
        }

        currentUnlisten = unlisten;
        unlistenRef.current = unlisten;

        setIsStreaming(true);
        setIsConnecting(false);
      } catch (err) {
        if (!active) return;

        console.error("Failed to start log streaming:", err);
        const errorMsg = normalizeTauriError(err);

        if (isPremiumFeatureError(errorMsg)) {
          setError(
            "Log streaming is a premium feature. Please activate your license to use real-time log streaming."
          );
        } else {
          const isPodNotFoundError =
            errorMsg.includes("not found") || errorMsg.includes("NotFound");

          setError(errorMsg);

          if (isPodNotFoundError && onPodNotFound) {
            onPodNotFound();
          }
        }
        setIsConnecting(false);
        setIsStreaming(false);
      }
    };

    initStream();

    return () => {
      cleanup();
    };
  }, [container, tailLines, podName, namespace, isPaused, retryTrigger, onPodNotFound]);

  return {
    logs,
    isStreaming,
    isConnecting,
    error,
    isPaused,
    clearLogs,
    togglePause,
    retry,
  };
}
