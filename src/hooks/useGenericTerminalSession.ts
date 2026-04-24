import { useState, useRef, useCallback, useEffect } from "react";
import { commands } from "@/lib/commands";
import { listen } from "@tauri-apps/api/event";

export type SessionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "closed"
  | "error";

interface UseGenericTerminalSessionProps {
  sessionId: string | null;
  onOutput?: (data: string) => void;
  onClose?: (status?: string | null) => void;
}

/**
 * Generic terminal session hook that works with any session ID.
 * Does not know about pods, processes, or any specific session type.
 */
export function useGenericTerminalSession({
  sessionId,
  onOutput,
  onClose,
}: UseGenericTerminalSessionProps) {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void)[]>([]);
  const statusRef = useRef<SessionStatus>("idle");
  const isMountedRef = useRef(false);
  const currentSessionIdRef = useRef<string | null>(null);

  // Use refs for callbacks to avoid re-running effect when they change
  const onOutputRef = useRef(onOutput);
  const onCloseRef = useRef(onClose);

  // Keep refs up to date
  useEffect(() => {
    onOutputRef.current = onOutput;
    onCloseRef.current = onClose;
  }, [onOutput, onClose]);

  const cleanupSession = useCallback(async () => {
    unlistenRef.current.forEach((u) => u());
    unlistenRef.current = [];

    const sid = currentSessionIdRef.current;
    if (sid) {
      currentSessionIdRef.current = null;
      try {
        await commands.closeTerminal(sid);
      } catch (err) {
        console.error("Failed to close terminal session:", err);
      }
      if (isMountedRef.current) {
        setStatus("closed");
      }
    } else {
      if (isMountedRef.current) {
        setStatus("idle");
      }
    }
  }, []);

  const send = useCallback(async (data: string) => {
    const sid = currentSessionIdRef.current;
    if (sid && statusRef.current === "connected") {
      try {
        await commands.terminalInput(sid, data);
      } catch (err) {
        console.error("Failed to send terminal input:", err);
      }
    }
  }, []);

  const resize = useCallback(async (cols: number, rows: number) => {
    const sid = currentSessionIdRef.current;
    if (sid && statusRef.current === "connected") {
      try {
        await commands.terminalResize(sid, cols, rows);
      } catch (err) {
        console.error("Failed to resize terminal:", err);
      }
    }
  }, []);

  // Setup listeners when sessionId changes
  useEffect(() => {
    let cleanupCalled = false;

    // Local cleanup function to avoid dependency issues
    const cleanup = () => {
      if (cleanupCalled) return;
      cleanupCalled = true;

      unlistenRef.current.forEach((u) => u());
      unlistenRef.current = [];

      const sid = currentSessionIdRef.current;
      if (sid) {
        currentSessionIdRef.current = null;
        commands.closeTerminal(sid).catch((err) => {
          console.error("Failed to close terminal session:", err);
        });
        if (isMountedRef.current) {
          setStatus("closed");
        }
      } else {
        if (isMountedRef.current) {
          setStatus("idle");
        }
      }
    };

    if (!sessionId) {
      cleanup();
      return;
    }

    currentSessionIdRef.current = sessionId;
    if (isMountedRef.current) {
      setStatus("connected");
      setError(null);
    }

    const setupListeners = async () => {
      // Check if cleanup was called during async setup
      if (cleanupCalled) return;

      try {
        // Listen for output
        const unlistenOutput = await listen<{ session_id: string; data: string }>(
          "terminal-output",
          (event) => {
            if (event.payload.session_id === sessionId && onOutputRef.current) {
              onOutputRef.current(event.payload.data);
            }
          }
        );
        if (cleanupCalled) {
          unlistenOutput();
          return;
        }
        unlistenRef.current.push(unlistenOutput);

        // Listen for close
        const unlistenClosed = await listen<{
          session_id: string;
          status?: string | null;
        }>("terminal-closed", (event) => {
          if (event.payload.session_id === sessionId) {
            unlistenRef.current.forEach((u) => u());
            unlistenRef.current = [];
            currentSessionIdRef.current = null;
            if (isMountedRef.current) {
              setStatus("closed");
            }
            if (onCloseRef.current) onCloseRef.current(event.payload.status);
          }
        });
        if (cleanupCalled) {
          unlistenClosed();
          return;
        }
        unlistenRef.current.push(unlistenClosed);
      } catch (err) {
        console.error("Failed to setup terminal listeners:", err);
        if (isMountedRef.current) {
          setStatus("error");
          setError("Failed to setup terminal listeners");
        }
      }
    };

    setupListeners();

    // Cleanup on sessionId change or unmount
    return cleanup;
  }, [sessionId]);

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    status,
    error,
    send,
    resize,
    disconnect: cleanupSession,
  };
}
