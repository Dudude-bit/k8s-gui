import { ReactNode } from "react";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Spinner } from "@/components/ui/spinner";
import { LiveIndicator } from "@/components/ui/live-indicator";

interface ResourceListHeaderProps {
  title: string;
  description?: string;
  isFetching?: boolean;
  isLoading?: boolean;
  onRefresh: () => void;
  actions?: ReactNode;
  /** Whether real-time watch is active */
  isWatching?: boolean;
}

export function ResourceListHeader({
  title,
  description,
  isFetching,
  isLoading,
  onRefresh,
  actions,
  isWatching,
}: ResourceListHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{title}</h1>
          <LiveIndicator isActive={isWatching ?? false} size="sm" />
          {isFetching && !isLoading && (
            <Spinner size="sm" className="text-muted-foreground" />
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <RefreshButton onRefresh={onRefresh} isRefreshing={isFetching} />
      </div>
    </div>
  );
}
