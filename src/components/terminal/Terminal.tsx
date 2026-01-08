import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useThemeStore } from "@/stores/themeStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { commands } from "@/lib/commands";
import { useTerminalSession } from "@/hooks/useTerminalSession";
import { normalizeTauriError } from "@/lib/error-utils";

interface TerminalProps {
  podName: string;
  namespace: string;
  containerName: string;
  sessionId?: string;
  onClose?: () => void;
}

export function Terminal({
  podName,
  namespace,
  containerName,
  onClose,
}: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { theme } = useThemeStore();
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

  const onOutput = useCallback((data: string) => {
    xtermRef.current?.write(data);
  }, []);

  const onSessionClose = useCallback((status?: string | null) => {
    if (xtermRef.current && status) {
      xtermRef.current.writeln(`\r\n\x1b[33mSession ended: ${status}\x1b[0m`);
    }
  }, []);

  const { status, error, connect, disconnect, send, resize } = useTerminalSession({
    podName,
    namespace,
    containerName,
    onOutput,
    onClose: onSessionClose,
  });

  const isDark = theme === "dark";
  const terminalTheme = useMemo(
    () =>
      isDark
        ? {
          background: "#1a1a2e",
          foreground: "#e4e4e7",
          cursor: "#3b82f6",
          selectionBackground: "#3b82f680",
          black: "#09090b",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#eab308",
          blue: "#3b82f6",
          magenta: "#a855f7",
          cyan: "#06b6d4",
          white: "#fafafa",
          brightBlack: "#52525b",
          brightRed: "#f87171",
          brightGreen: "#4ade80",
          brightYellow: "#facc15",
          brightBlue: "#60a5fa",
          brightMagenta: "#c084fc",
          brightCyan: "#22d3ee",
          brightWhite: "#ffffff",
        }
        : {
          background: "#fafafa",
          foreground: "#18181b",
          cursor: "#2563eb",
          selectionBackground: "#3b82f640",
          black: "#09090b",
          red: "#dc2626",
          green: "#16a34a",
          yellow: "#ca8a04",
          blue: "#2563eb",
          magenta: "#9333ea",
          cyan: "#0891b2",
          white: "#f4f4f5",
          brightBlack: "#71717a",
          brightRed: "#ef4444",
          brightGreen: "#22c55e",
          brightYellow: "#eab308",
          brightBlue: "#3b82f6",
          brightMagenta: "#a855f7",
          brightCyan: "#06b6d4",
          brightWhite: "#ffffff",
        },
    [isDark]
  );

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm
    const xterm = new XTerm({
      cursorBlink: true,
      fontFamily: "JetBrains Mono, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      theme: terminalTheme,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.open(terminalRef.current);

    // Fit terminal to container
    setTimeout(() => fitAddon.fit(), 0);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    xterm.onData((data) => {
      send(data);
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      if (status === "connected") {
        resize(xterm.cols, xterm.rows);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);

    connect();

    return () => {
      resizeObserver.disconnect();
      xterm.dispose();
      disconnect(); // Ensure session is closed
    };
  }, [connect, disconnect, resize, send, status, terminalTheme]);

  // Polling logic for Pod status
  useEffect(() => {
    if (status !== "connected") {
      return;
    }

    let cancelled = false;

    const checkPodState = async () => {
      if (cancelled) return;

      try {
        const pod = await commands.getPod(podName, namespace);
        const container = pod.containers?.find(
          (item) => item.name === containerName
        );

        if (!container) {
          setUnavailableReason("Container not found");
          disconnect();
          return;
        }

        if (container.state.type === "terminated") {
          const reason = container.state.reason
            ? `: ${container.state.reason}`
            : "";
          setUnavailableReason(`Container terminated${reason}`);
          disconnect();
          return;
        }

        const phase = pod.status.phase.toLowerCase();
        if (phase === "failed" || phase === "succeeded") {
          setUnavailableReason(`Pod ${pod.status.phase}`);
          disconnect();
        }
      } catch (error) {
        const errorText = normalizeTauriError(error);
        if (errorText.includes("not found") || errorText.includes("NotFound")) {
          setUnavailableReason("Pod not found");
          disconnect();
        }
      }
    };

    const intervalId = window.setInterval(checkPodState, 8000);
    checkPodState();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [containerName, disconnect, namespace, podName, status]);

  // Clear unavailable reason when connecting
  useEffect(() => {
    if (status === 'connecting') {
      setUnavailableReason(null);
    }
  }, [status]);

  const terminalBackground = terminalTheme.background;
  const showReopen =
    status === "closed" ||
    status === "unavailable" ||
    status === "error" ||
    !!unavailableReason;

  const statusLabel = (() => {
    if (unavailableReason) return "Unavailable";
    switch (status) {
      case "connecting":
        return "Connecting";
      case "connected":
        return "Connected";
      case "closed":
        return "Ended";
      case "unavailable":
        return "Unavailable";
      case "error":
        return "Error";
      default:
        return "Idle";
    }
  })();

  const statusVariant: ComponentProps<typeof Badge>["variant"] = (() => {
    if (unavailableReason) return "warning";
    switch (status) {
      case "connected":
        return "success";
      case "error":
        return "error";
      case "unavailable":
        return "warning";
      case "connecting":
        return "secondary";
      case "closed":
        return "secondary";
      default:
        return "outline";
    }
  })();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-muted border-b">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Pod:</span>
          <span className="font-medium">{podName}</span>
          <span className="text-muted-foreground">Container:</span>
          <span className="font-medium">{containerName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant}>{statusLabel}</Badge>
          {(error || unavailableReason) && status !== "connected" && (
            <span className="text-xs text-muted-foreground max-w-[240px] truncate">
              {error || unavailableReason}
            </span>
          )}
          {showReopen && (
            <Button variant="outline" size="sm" onClick={connect}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Reopen
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close terminal"
            >
              ×
            </Button>
          )}
        </div>
      </div>
      <div
        ref={terminalRef}
        className="flex-1 min-h-0 overflow-hidden"
        style={{ backgroundColor: terminalBackground }}
      />
    </div>
  );
}
