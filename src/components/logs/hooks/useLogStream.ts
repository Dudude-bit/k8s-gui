import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { commands } from "@/lib/commands";
import type {
  LogFormat,
  LogLevel,
  LogLine,
  StreamLogConfig,
} from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";

const MAX_LOG_LINES = 5000;

/**
 * `LogLine` from the backend has no stable identity — two events can
 * carry identical timestamp + message bytes (rapid duplicate logs are
 * common). React needs a stable, unique key to avoid remounting
 * unrelated rows when a filter shrinks the visible array. Tag each log
 * with a monotonic id assigned at receive time.
 */
export type StreamedLogLine = LogLine & { id: number };

interface UseLogStreamOptions {
  podName: string;
  namespace: string;
  container: string;
  tailLines: number;
  onPodNotFound?: () => void;
}

interface UseLogStreamResult {
  logs: StreamedLogLine[];
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
  const [logs, setLogs] = useState<StreamedLogLine[]>([]);
  const nextIdRef = useRef(0);
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
          lines: Array<{
            message: string;
            timestamp: string | null;
            level: LogLevel | null;
            format: LogFormat | null;
            fields: Record<string, string> | null;
            raw: string;
          }>;
        }>("log-batch", (event) => {
          if (event.payload.stream_id !== streamId) return;
          if (event.payload.lines.length === 0) return;

          // Tag every line in the batch with a unique synthetic id at
          // receive time so React keys stay stable across filter
          // changes (see useLogStream.test.ts).
          const tagged: StreamedLogLine[] = event.payload.lines.map((line) => ({
            id: nextIdRef.current++,
            timestamp: line.timestamp,
            message: line.message,
            level: line.level,
            format: line.format ?? "plain",
            fields: line.fields,
            raw: line.raw || line.message,
            pod: podName,
            container,
            namespace,
          }));

          setLogs((prev) => [...prev, ...tagged].slice(-MAX_LOG_LINES));
        });

        if (!active) {
          unlisten();
          commands.stopLogStream(streamId).catch(console.error);
          setIsConnecting(false);
          return;
        }

        currentUnlisten = unlisten;
        unlistenRef.current = unlisten;

        // Listener is installed — release the backend gate so it can
        // start emitting log-batch events without losing the first ones.
        // See `commands::logs::stream_pod_logs` for the gate.
        try {
          await commands.logStreamSubscribed(streamId);
        } catch (err) {
          // Map entry was removed (e.g. another stop_log_stream raced
          // us). Stream will not emit anything; surface as error.
          if (active) {
            console.error("Failed to subscribe log stream:", err);
            setError(normalizeTauriError(err));
            setIsConnecting(false);
            return;
          }
        }

        setIsStreaming(true);
        setIsConnecting(false);
      } catch (err) {
        if (!active) return;

        console.error("Failed to start log streaming:", err);
        const errorMsg = normalizeTauriError(err);
        const isPodNotFoundError =
          errorMsg.includes("not found") || errorMsg.includes("NotFound");

        setError(errorMsg);

        if (isPodNotFoundError && onPodNotFound) {
          onPodNotFound();
        }
        setIsConnecting(false);
        setIsStreaming(false);
      }
    };

    initStream();

    return () => {
      cleanup();
    };
  }, [
    container,
    tailLines,
    podName,
    namespace,
    isPaused,
    retryTrigger,
    onPodNotFound,
  ]);

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
