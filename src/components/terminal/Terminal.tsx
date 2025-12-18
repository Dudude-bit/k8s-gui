import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useThemeStore } from '@/stores/themeStore';

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
  sessionId,
  onClose,
}: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { theme } = useThemeStore();

  useEffect(() => {
    if (!terminalRef.current) return;

    const isDark = theme === 'dark';

    // Initialize xterm
    const xterm = new XTerm({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: isDark
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
      if (sessionId) {
        invoke('terminal_resize', {
          sessionId,
          cols: xterm.cols,
          rows: xterm.rows,
        }).catch(console.error);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);

    // Start shell session
    const startSession = async () => {
      try {
        const newSessionId = await invoke<string>('open_shell', {
          pod: podName,
          namespace,
          container: containerName,
        });

        xterm.writeln(`\x1b[32mConnected to ${podName}/${containerName}\x1b[0m\r\n`);

        // Listen for terminal output
        const unlisten = await listen<{ session_id: string; data: string }>(
          'terminal-output',
          (event) => {
            if (event.payload.session_id === newSessionId) {
              xterm.write(event.payload.data);
            }
          }
        );

        // Handle user input
        xterm.onData((data) => {
          invoke('terminal_input', {
            sessionId: newSessionId,
            data,
          }).catch(console.error);
        });

        // Cleanup on unmount
        return () => {
          unlisten();
          invoke('close_terminal', { sessionId: newSessionId }).catch(console.error);
        };
      } catch (error) {
        xterm.writeln(`\x1b[31mFailed to connect: ${error}\x1b[0m`);
        return () => {};
      }
    };

    let cleanup: () => void = () => {};
    startSession().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cleanup();
      resizeObserver.disconnect();
      xterm.dispose();
    };
  }, [podName, namespace, containerName, sessionId, theme]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 bg-muted border-b">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Pod:</span>
          <span className="font-medium">{podName}</span>
          <span className="text-muted-foreground">Container:</span>
          <span className="font-medium">{containerName}</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>
      <div ref={terminalRef} className="flex-1 p-2" />
    </div>
  );
}
