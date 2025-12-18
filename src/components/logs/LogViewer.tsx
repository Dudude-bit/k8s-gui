import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Download,
  Pause,
  Play,
  Search,
  Trash2,
  ArrowDown,
} from 'lucide-react';

interface LogViewerProps {
  podName: string;
  namespace: string;
  containers: string[];
  initialContainer?: string;
}

interface LogLine {
  timestamp: string;
  message: string;
  container?: string;
}

export function LogViewer({
  podName,
  namespace,
  containers,
  initialContainer,
}: LogViewerProps) {
  const [selectedContainer, setSelectedContainer] = useState(
    initialContainer || containers[0]
  );
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tailLines, setTailLines] = useState(100);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamIdRef = useRef<string | null>(null);

  // Filter logs based on search
  const filteredLogs = searchQuery
    ? logs.filter((log) =>
        log.message.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : logs;

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Start streaming logs
  const startStreaming = async () => {
    try {
      setIsStreaming(true);
      
      const streamId = await invoke<string>('stream_pod_logs', {
        pod: podName,
        namespace,
        container: selectedContainer,
        tailLines,
        follow: true,
      });
      
      streamIdRef.current = streamId;

      // Listen for log events
      const unlisten = await listen<{ stream_id: string; line: string }>(
        'log-line',
        (event) => {
          if (event.payload.stream_id === streamId) {
            const parts = event.payload.line.split(' ');
            const timestamp = parts[0] || new Date().toISOString();
            const message = parts.slice(1).join(' ') || event.payload.line;
            
            setLogs((prev) => [
              ...prev,
              { timestamp, message, container: selectedContainer },
            ]);
          }
        }
      );

      return unlisten;
    } catch (error) {
      console.error('Failed to start log streaming:', error);
      setIsStreaming(false);
    }
  };

  const stopStreaming = async () => {
    if (streamIdRef.current) {
      try {
        await invoke('stop_log_stream', { streamId: streamIdRef.current });
      } catch (error) {
        console.error('Failed to stop log streaming:', error);
      }
      streamIdRef.current = null;
    }
    setIsStreaming(false);
  };

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
      const content = await invoke<string>('download_pod_logs', {
        pod: podName,
        namespace,
        container: selectedContainer,
        tailLines: 10000,
      });
      
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${podName}-${selectedContainer}-logs.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download logs:', error);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, []);

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

  const formatTimestamp = (timestamp: string) => {
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
            variant={autoScroll ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setAutoScroll(!autoScroll)}
            title="Auto-scroll"
          >
            <ArrowDown className="h-4 w-4" />
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
            variant={isStreaming ? 'destructive' : 'default'}
            size="sm"
            onClick={toggleStreaming}
          >
            {isStreaming ? (
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
      <ScrollArea className="flex-1">
        <div
          ref={scrollRef}
          className="p-4 font-mono text-xs leading-relaxed"
          style={{ minHeight: '100%' }}
        >
          {filteredLogs.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {isStreaming
                ? 'Waiting for logs...'
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
          {filteredLogs.length} {filteredLogs.length === 1 ? 'line' : 'lines'}
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

  const parts = text.split(new RegExp(`(${query})`, 'gi'));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-500/30 text-foreground rounded px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}
