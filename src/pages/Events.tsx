import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClusterStore } from '@/stores/clusterStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';
import { RefreshCw, AlertTriangle, Info, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EventInfo {
  name: string;
  namespace: string;
  event_type: string | null;
  reason: string | null;
  message: string | null;
  first_timestamp: string | null;
  last_timestamp: string | null;
  count: number | null;
  involved_object_kind: string | null;
  involved_object_name: string | null;
}

export function Events() {
  const { isConnected, currentNamespace } = useClusterStore();
  const [eventType, setEventType] = useState<string>('all');

  const { data: events = [], isLoading, refetch } = useQuery({
    queryKey: ['events', currentNamespace, eventType],
    queryFn: async () => {
      const filters = {
        namespace: currentNamespace,
        event_type: eventType === 'all' ? null : eventType,
      };
      const result = await invoke<EventInfo[]>('list_events', { filters });
      return result;
    },
    enabled: isConnected,
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Connect to a cluster to view events
      </div>
    );
  }

  const warningCount = events.filter((e) => e.event_type === 'Warning').length;
  const normalCount = events.filter((e) => e.event_type === 'Normal').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
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
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
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
      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
          <CardDescription>
            Events from namespace {currentNamespace}
          </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[600px] overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading events...
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
  const isWarning = event.event_type === 'Warning';

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        isWarning ? 'border-yellow-500/50 bg-yellow-500/5' : 'border-border'
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
            {event.involved_object_kind}/{event.involved_object_name}
          </Badge>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {event.last_timestamp
            ? new Date(event.last_timestamp).toLocaleString()
            : 'Unknown'}
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
