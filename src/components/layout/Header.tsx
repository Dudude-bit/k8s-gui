import { useEffect } from 'react';
import { useClusterStore } from '@/stores/clusterStore';
import { useThemeStore } from '@/stores/themeStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Search, Moon, Sun, Monitor, RefreshCw, Command, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

export function Header() {
  const {
    contexts,
    currentContext,
    currentNamespace,
    isConnected,
    isLoading,
    error,
    loadContexts,
    switchContext,
    switchNamespace,
    connect,
  } = useClusterStore();
  const { theme, setTheme } = useThemeStore();

  // Load contexts on mount and auto-connect
  useEffect(() => {
    const initConnection = async () => {
      await loadContexts();
    };
    initConnection();
  }, [loadContexts]);

  // Auto-connect when currentContext is set but not connected
  useEffect(() => {
    if (currentContext && !isConnected && !isLoading && !error) {
      connect(currentContext);
    }
  }, [currentContext, isConnected, isLoading, error, connect]);

  // Fetch namespaces when connected
  const { data: namespaces = [], refetch: refetchNamespaces } = useQuery({
    queryKey: ['namespaces', currentContext],
    queryFn: async () => {
      const result = await invoke<{ name: string }[]>('list_namespaces');
      return result.map((ns) => ns.name);
    },
    enabled: isConnected,
  });

  const handleContextChange = async (context: string) => {
    await switchContext(context);
    await connect(context);
    refetchNamespaces();
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-4">
      {/* Left: Cluster and Namespace selectors */}
      <div className="flex items-center gap-4">
        {/* Cluster selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Cluster:</span>
          <Select
            value={currentContext || ''}
            onValueChange={handleContextChange}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select cluster" />
            </SelectTrigger>
            <SelectContent>
              {contexts.map((ctx) => (
                <SelectItem key={ctx.name} value={ctx.name}>
                  {ctx.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Connection status indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : error ? (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <div
                    className={cn(
                      'h-2.5 w-2.5 rounded-full',
                      isConnected ? 'bg-green-500' : 'bg-gray-400'
                    )}
                  />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {isLoading ? (
                <span>Connecting to cluster...</span>
              ) : error ? (
                <div className="space-y-1">
                  <div className="font-medium text-red-500">Connection Error</div>
                  <div className="text-xs text-muted-foreground break-words">{error}</div>
                </div>
              ) : isConnected ? (
                <span className="text-green-500">Connected to {currentContext}</span>
              ) : (
                <span>Not connected. Select a cluster to connect.</span>
              )}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Namespace selector */}
        {isConnected && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Namespace:</span>
            <Select
              value={currentNamespace || '__all__'}
              onValueChange={(value) => switchNamespace(value === '__all__' ? '' : value)}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select namespace" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">
                  <span className="font-medium">All namespaces</span>
                </SelectItem>
                {namespaces.map((ns) => (
                  <SelectItem key={ns} value={ns}>
                    {ns}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Refresh button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetchNamespaces()}
          disabled={!isConnected}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Right: Search and theme */}
      <div className="flex items-center gap-2">
        {/* Command palette trigger */}
        <Button
          variant="outline"
          className="justify-start text-sm text-muted-foreground"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('command-palette-open'));
          }}
        >
          <Search className="mr-2 h-4 w-4" />
          Search...
          <kbd className="ml-auto inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <Command className="h-3 w-3" />K
          </kbd>
        </Button>

        {/* Theme toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              {theme === 'light' && <Sun className="h-4 w-4" />}
              {theme === 'dark' && <Moon className="h-4 w-4" />}
              {theme === 'system' && <Monitor className="h-4 w-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme('light')}>
              <Sun className="mr-2 h-4 w-4" />
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              <Moon className="mr-2 h-4 w-4" />
              Dark
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setTheme('system')}>
              <Monitor className="mr-2 h-4 w-4" />
              System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
