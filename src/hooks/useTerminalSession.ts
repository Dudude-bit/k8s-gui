import { useState, useRef, useCallback, useEffect } from "react";
import { commands } from "@/lib/commands";
import { listen } from "@tauri-apps/api/event";
import { normalizeTauriError } from "@/lib/error-utils";

export type SessionStatus =
    | "idle"
    | "connecting"
    | "connected"
    | "closed"
    | "unavailable"
    | "error";

interface UseTerminalSessionProps {
    podName: string;
    namespace: string;
    containerName: string;
    onOutput?: (data: string) => void;
    onClose?: (status?: string | null) => void;
}

export function useTerminalSession({
    podName,
    namespace,
    containerName,
    onOutput,
    onClose,
}: UseTerminalSessionProps) {
    const [status, setStatus] = useState<SessionStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const isCleanedUpRef = useRef(false);
    const unlistenRef = useRef<(() => void)[]>([]);
    const statusRef = useRef<SessionStatus>("idle");

    // Keep statusRef in sync with status
    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    const cleanupListeners = useCallback(() => {
        unlistenRef.current.forEach((u) => u());
        unlistenRef.current = [];
    }, []);

    const cleanupSession = useCallback(async () => {
        isCleanedUpRef.current = true;
        cleanupListeners();

        const sessionId = sessionIdRef.current;
        if (sessionId) {
            sessionIdRef.current = null;
            try {
                await commands.closeTerminal(sessionId);
            } catch (err) {
                console.error("Failed to close terminal session:", err);
            }
        }
    }, [cleanupListeners]);

    const send = useCallback(async (data: string) => {
        const sessionId = sessionIdRef.current;
        if (sessionId && statusRef.current === "connected") {
            try {
                await commands.terminalInput(sessionId, data);
            } catch (err) {
                console.error("Failed to send terminal input:", err);
            }
        }
    }, []);

    const resize = useCallback(async (cols: number, rows: number) => {
        const sessionId = sessionIdRef.current;
        if (sessionId && statusRef.current === "connected") {
            try {
                await commands.terminalResize(sessionId, cols, rows);
            } catch (err) {
                console.error("Failed to resize terminal:", err);
            }
        }
    }, []);

    const connect = useCallback(async () => {
        if (statusRef.current === "connecting" || statusRef.current === "connected") return;

        // Reset state
        isCleanedUpRef.current = false;
        cleanupListeners(); // Clear any old listeners
        setStatus("connecting");
        setError(null);

        try {
            const sid = await commands.openShell(namespace, podName, containerName, null);

            if (isCleanedUpRef.current) {
                // Cleanup happened while connecting
                await commands.closeTerminal(sid);
                return;
            }

            sessionIdRef.current = sid;
            setStatus("connected");

            // Listen for output
            const unlistenOutput = await listen<{ session_id: string; data: string }>(
                "terminal-output",
                (event) => {
                    if (event.payload.session_id === sid && onOutput) {
                        onOutput(event.payload.data);
                    }
                }
            );
            unlistenRef.current.push(unlistenOutput);

            // Listen for close
            const unlistenClosed = await listen<{
                session_id: string;
                status?: string | null;
            }>("terminal-closed", (event) => {
                if (event.payload.session_id === sid) {
                    cleanupListeners();
                    sessionIdRef.current = null;
                    setStatus("closed");
                    if (onClose) onClose(event.payload.status);
                }
            });
            unlistenRef.current.push(unlistenClosed);

        } catch (err) {
            console.error("Failed to open shell:", err);
            setStatus("error");
            setError(normalizeTauriError(err));
            // Try to close if we got a session ID somehow? (Unlikely if openShell threw)
        }
    }, [namespace, podName, containerName, onOutput, onClose, cleanupListeners]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanupSession();
        };
    }, [cleanupSession]);

    return {
        status,
        error,
        connect,
        disconnect: cleanupSession,
        send,
        resize,
    };
}
