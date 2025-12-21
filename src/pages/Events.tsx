import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useClusterStore } from "@/stores/clusterStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectClusterEmptyState } from "@/components/ui/connect-cluster-empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { RefreshCw, AlertTriangle, Info, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface InvolvedObjectInfo {
  kind: string;
  name: string;
  namespace: string | null;
  uid: string | null;
}

interface EventInfo {
  name: string;
  namespace: string;
  uid: string;
  type_: string;
  reason: string | null;
  message: string | null;
  source: string | null;
  involved_object: InvolvedObjectInfo;
  count: number | null;
  first_timestamp: string | null;
  last_timestamp: string | null;
}

export function Events() {
  const { isConnected, currentNamespace } = useClusterStore();
  const [eventType, setEventType] = useState<string>("all");
  const [eventLimit, setEventLimit] = useState<string>("500");

  const {
    data: events = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["events", currentNamespace, eventType, eventLimit],
    queryFn: async () => {
      const limit = eventLimit === "all" ? null : Number(eventLimit);
      const result = await invoke<EventInfo[]>("list_events", {
        filters: {
          namespace: currentNamespace,
          event_type: eventType === "all" ? null : eventType,
          limit,
        },
      });
      return result;
    },
    enabled: isConnected,
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });

  if (!isConnected) {
    return <ConnectClusterEmptyState resourceLabel="events" />;
  }

  const warningCount = events.filter((e) => e.type_ === "Warning").length;
  const normalCount = events.filter((e) => e.type_ === "Normal").length;
  const showSkeleton = isLoading && events.length === 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Events</h1>
          {isFetching && !isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="Warning">Warnings</SelectItem>
              <SelectItem value="Normal">Normal</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventLimit} onValueChange={setEventLimit}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Limit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="200">200</SelectItem>
              <SelectItem value="500">500</SelectItem>
              <SelectItem value="1000">1000</SelectItem>
              <SelectItem value="2000">2000</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4">
        <Badge variant="secondary" className="gap-1">
          <Info className="h-3 w-3" />
          {normalCount} Normal
        </Badge>
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          {warningCount} Warning
        </Badge>
      </div>

      {/* Events List */}
      <Card
        className={cn(
          "transition-opacity duration-200",
          isFetching && "opacity-70",
        )}
      >
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
          <CardDescription>
            Events from {currentNamespace || "all namespaces"}
            {eventLimit !== "all" && ` • Limit ${eventLimit}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[600px] overflow-y-auto scrollbar-thin">
          {showSkeleton ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No events found
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((event, index) => (
                <EventItem key={`${event.name}-${index}`} event={event} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EventItem({ event }: { event: EventInfo }) {
  const isWarning = event.type_ === "Warning";

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        isWarning ? "border-yellow-500/50 bg-yellow-500/5" : "border-border",
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {isWarning ? (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          ) : (
            <Info className="h-4 w-4 text-blue-500" />
          )}
          <span className="font-medium">{event.reason}</span>
          <Badge variant="outline" className="text-xs">
            {event.involved_object.kind}/{event.involved_object.name}
          </Badge>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {event.last_timestamp
            ? new Date(event.last_timestamp).toLocaleString()
            : "Unknown"}
          {(event.count || 0) > 1 && (
            <Badge variant="secondary" className="ml-2">
              x{event.count}
            </Badge>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{event.message}</p>
    </div>
  );
}
