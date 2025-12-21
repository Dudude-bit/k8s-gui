import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useThemeStore } from '@/stores/themeStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface TerminalProps {
  podName: string;
  namespace: string;
  containerName: string;
  sessionId?: string;
  onClose?: () => void;
}

interface PodInfo {
  status?: {
    phase?: string;
  };
  containers?: {
    name: string;
    state?: {
      type?: 'running' | 'waiting' | 'terminated' | 'unknown';
      reason?: string | null;
    };
  }[];
}

type SessionStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'unavailable' | 'error';

export function Terminal({
  podName,
  namespace,
  containerName,
  sessionId,
  onClose,
}: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isClosedRef = useRef(false);
  const cleanupRef = useRef<null | (() => void)>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const { theme } = useThemeStore();

  const isDark = theme === 'dark';
  const terminalTheme = useMemo(
    () =>
      isDark
        ? {
            background: '#1a1a2e',
            foreground: '#e4e4e7',
            cursor: '#3b82f6',
            selectionBackground: '#3b82f680',
            black: '#09090b',
            red: '#ef4444',
            green: '#22c55e',
            yellow: '#eab308',
            blue: '#3b82f6',
            magenta: '#a855f7',
            cyan: '#06b6d4',
            white: '#fafafa',
            brightBlack: '#52525b',
            brightRed: '#f87171',
            brightGreen: '#4ade80',
            brightYellow: '#facc15',
            brightBlue: '#60a5fa',
            brightMagenta: '#c084fc',
            brightCyan: '#22d3ee',
            brightWhite: '#ffffff',
          }
        : {
            background: '#fafafa',
            foreground: '#18181b',
            cursor: '#2563eb',
            selectionBackground: '#3b82f640',
            black: '#09090b',
            red: '#dc2626',
            green: '#16a34a',
            yellow: '#ca8a04',
            blue: '#2563eb',
            magenta: '#9333ea',
            cyan: '#0891b2',
            white: '#f4f4f5',
            brightBlack: '#71717a',
            brightRed: '#ef4444',
            brightGreen: '#22c55e',
            brightYellow: '#eab308',
            brightBlue: '#3b82f6',
            brightMagenta: '#a855f7',
            brightCyan: '#06b6d4',
            brightWhite: '#ffffff',
          },
    [isDark]
  );

  const clearSession = useCallback(() => {
    const cleanup = cleanupRef.current;
    cleanupRef.current = null;
    if (cleanup) {
      cleanup();
    }
    activeSessionIdRef.current = null;
  }, []);

  const markSessionEnded = useCallback(
    (
      status: SessionStatus,
      message: string,
      color: 'yellow' | 'red' = 'yellow',
      autoClose = false
    ) => {
      if (isClosedRef.current) {
        return;
      }
      isClosedRef.current = true;
      setSessionStatus(status);
      setStatusMessage(message);
      if (xtermRef.current) {
        const colorCode = color === 'red' ? '31' : '33';
        xtermRef.current.writeln(`\r\n\x1b[${colorCode}m${message}\x1b[0m`);
      }
      clearSession();
      if (autoClose && onClose) {
        setTimeout(() => onClose(), 300);
      }
    },
    [clearSession, onClose]
  );

  const startSession = useCallback(async () => {
    const xterm = xtermRef.current;
    if (!xterm) {
      return;
    }

    if (cleanupRef.current) {
      clearSession();
    }

    isClosedRef.current = false;
    setSessionStatus('connecting');
    setStatusMessage(null);

    xterm.clear();
    xterm.writeln(`\x1b[33mConnecting to ${podName}/${containerName}...\x1b[0m\r\n`);

    try {
      const newSessionId = await invoke<string>('open_shell', {
        pod: podName,
        namespace,
        container: containerName,
        shell: null,
      });

      activeSessionIdRef.current = newSessionId;
      setSessionStatus('connected');

      xterm.writeln(`\x1b[32mConnected to ${podName}/${containerName}\x1b[0m\r\n`);

      const unlistenOutput = await listen<{ session_id: string; data: string }>(
        'terminal-output',
        (event) => {
          if (event.payload.session_id === newSessionId) {
            xterm.write(event.payload.data);
          }
        }
      );

      const unlistenClosed = await listen<{ session_id: string; status?: string | null }>(
        'terminal-closed',
        (event) => {
          if (event.payload.session_id !== newSessionId || isClosedRef.current) {
            return;
          }
          const statusText = event.payload.status ? `Session ended (${event.payload.status})` : 'Session ended';
          markSessionEnded('closed', statusText, 'yellow');
        }
      );

      const disposeData = xterm.onData((data) => {
        if (isClosedRef.current) {
          return;
        }
        invoke('terminal_input', {
          sessionId: newSessionId,
          data,
        }).catch((err) => {
          console.error('Failed to send input:', err);
          xterm.writeln(`\x1b[31mInput error: ${err}\x1b[0m`);
        });
      });

      cleanupRef.current = () => {
        isClosedRef.current = true;
        disposeData.dispose();
        unlistenOutput();
        unlistenClosed();
        invoke('close_terminal', { sessionId: newSessionId }).catch(console.error);
      };
    } catch (error) {
      console.error('Failed to open shell:', error);
      markSessionEnded('error', `Failed to connect: ${error}`, 'red');
    }
  }, [clearSession, containerName, markSessionEnded, namespace, podName]);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm
    const xterm = new XTerm({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
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

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      const activeSessionId = activeSessionIdRef.current || sessionId;
      if (activeSessionId) {
        invoke('terminal_resize', {
          sessionId: activeSessionId,
          cols: xterm.cols,
          rows: xterm.rows,
        }).catch(console.error);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);

    startSession();

    return () => {
      clearSession();
      resizeObserver.disconnect();
      xterm.dispose();
    };
  }, [clearSession, sessionId, startSession, terminalTheme]);

  useEffect(() => {
    if (sessionStatus !== 'connected') {
      return;
    }

    let cancelled = false;

    const checkPodState = async () => {
      if (cancelled || isClosedRef.current) {
        return;
      }

      try {
        const pod = await invoke<PodInfo>('get_pod', { name: podName, namespace });
        const container = pod.containers?.find((item) => item.name === containerName);

        if (!container) {
          markSessionEnded('unavailable', 'Container not found', 'yellow', true);
          return;
        }

        if (container.state?.type === 'terminated') {
          const reason = container.state.reason ? `: ${container.state.reason}` : '';
          markSessionEnded('unavailable', `Container terminated${reason}`, 'yellow', true);
          return;
        }

        const phase = pod.status?.phase?.toLowerCase();
        if (phase === 'failed' || phase === 'succeeded') {
          markSessionEnded('unavailable', `Pod ${pod.status?.phase}`, 'yellow', true);
        }
      } catch (error) {
        const errorText = String(error);
        if (errorText.includes('not found') || errorText.includes('NotFound')) {
          markSessionEnded('unavailable', 'Pod not found', 'yellow', true);
        }
      }
    };

    const intervalId = window.setInterval(checkPodState, 8000);
    checkPodState();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [containerName, markSessionEnded, namespace, podName, sessionStatus]);

  const terminalBackground = terminalTheme.background;
  const showReopen = sessionStatus === 'closed' || sessionStatus === 'unavailable' || sessionStatus === 'error';
  const statusLabel = (() => {
    switch (sessionStatus) {
      case 'connecting':
        return 'Connecting';
      case 'connected':
        return 'Connected';
      case 'closed':
        return 'Ended';
      case 'unavailable':
        return 'Unavailable';
      case 'error':
        return 'Error';
      default:
        return 'Idle';
    }
  })();
  const statusVariant: ComponentProps<typeof Badge>['variant'] = (() => {
    switch (sessionStatus) {
      case 'connected':
        return 'success';
      case 'error':
        return 'error';
      case 'unavailable':
        return 'warning';
      case 'connecting':
        return 'secondary';
      case 'closed':
        return 'secondary';
      default:
        return 'outline';
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
          {statusMessage && sessionStatus !== 'connected' && sessionStatus !== 'connecting' && (
            <span className="text-xs text-muted-foreground max-w-[240px] truncate">
              {statusMessage}
            </span>
          )}
          {showReopen && (
            <Button
              variant="outline"
              size="sm"
              onClick={startSession}
              disabled={sessionStatus === 'connecting'}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Reopen
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close terminal">
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
