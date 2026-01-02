import { useEffect } from "react";
import * as commands from "@/generated/commands";
import { useClusterStore } from "@/stores/clusterStore";
import { useThemeStore } from "@/stores/themeStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  Moon,
  Sun,
  Monitor,
  Command,
  AlertCircle,
  User,
  LogOut,
} from "lucide-react";
import { LicenseStatusBadge } from "@/components/license/LicenseStatusBadge";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { Spinner } from "@/components/ui/spinner";

export function Header() {
  const {
    contexts,
    currentContext,
    currentNamespace,
    isConnected,
    isLoading,
    isAuthenticating,
    error,
    pendingContext,
    errorContext,
    loadContexts,
    switchContext,
    switchNamespace,
    connect,
  } = useClusterStore();
  const { theme, setTheme } = useThemeStore();
  const { isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();

  // Load contexts on mount and auto-connect
  useEffect(() => {
    const initConnection = async () => {
      await loadContexts();
    };
    initConnection();
  }, [loadContexts]);

  // Auto-connect when currentContext is set but not connected
  useEffect(() => {
    if (
      currentContext &&
      !isConnected &&
      !isLoading &&
      !isAuthenticating &&
      !error &&
      !pendingContext
    ) {
      connect(currentContext);
    }
  }, [
    currentContext,
    isConnected,
    isLoading,
    isAuthenticating,
    error,
    pendingContext,
    connect,
  ]);

  // Fetch namespaces when connected
  const { data: namespaces = [], refetch: refetchNamespaces } = useQuery({
    queryKey: ["namespaces", currentContext],
    queryFn: async () => {
      const result = await commands.listNamespaces();
      return result.map((ns: { name: string }) => ns.name);
    },
    enabled: isConnected,
  });

  const handleContextChange = (context: string) => {
    switchContext(context);
    connect(context);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-4">
      {/* Left: Cluster and Namespace selectors */}
      <div className="flex items-center gap-4">
        {/* Cluster selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Cluster:</span>
          <Select
            value={currentContext || ""}
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
                  <Spinner size="sm" className="text-muted-foreground" />
                ) : error ? (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <div
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      isConnected ? "bg-green-500" : "bg-gray-400"
                    )}
                  />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {isLoading ? (
                <span>
                  Connecting to {pendingContext || currentContext || "cluster"}
                  ...
                </span>
              ) : error ? (
                <div className="space-y-1">
                  <div className="font-medium text-red-500">
                    Connection Error
                  </div>
                  <div className="text-xs text-muted-foreground break-words">
                    {errorContext ? `${errorContext}: ${error}` : error}
                  </div>
                </div>
              ) : isConnected ? (
                <span className="text-green-500">
                  Connected to {currentContext}
                </span>
              ) : (
                <span>Not connected. Select a cluster to connect.</span>
              )}
            </TooltipContent>
          </Tooltip>

          {error && !isLoading && (errorContext || currentContext) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <RefreshButton
                  onRefresh={() =>
                    connect(errorContext || currentContext || undefined)
                  }
                  variant="ghost"
                  size="icon"
                />
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Retry authentication
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Namespace selector */}
        {isConnected && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Namespace:</span>
            <Select
              value={currentNamespace || "__all__"}
              onValueChange={(value) =>
                switchNamespace(value === "__all__" ? "" : value)
              }
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
        <RefreshButton
          onRefresh={() => refetchNamespaces()}
          disabled={!isConnected}
          variant="ghost"
          size="icon"
        />
      </div>

      {/* Right: License, Search, Profile, and theme */}
      <div className="flex items-center gap-2">
        {/* License status badge */}
        <LicenseStatusBadge />

        {/* Command palette trigger */}
        <Button
          variant="outline"
          className="justify-start text-sm text-muted-foreground"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("command-palette-open"));
          }}
        >
          <Search className="mr-2 h-4 w-4" />
          Search...
          <kbd className="ml-auto inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <Command className="h-3 w-3" />K
          </kbd>
        </Button>

        {/* Profile menu */}
        {isAuthenticated ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <User className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="ghost" size="icon" asChild>
            <Link to="/login">
              <User className="h-4 w-4" />
            </Link>
          </Button>
        )}

        {/* Theme toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              {theme === "light" && <Sun className="h-4 w-4" />}
              {theme === "dark" && <Moon className="h-4 w-4" />}
              {theme === "system" && <Monitor className="h-4 w-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="mr-2 h-4 w-4" />
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="mr-2 h-4 w-4" />
              Dark
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Monitor className="mr-2 h-4 w-4" />
              System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
