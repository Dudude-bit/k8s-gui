import { ReactNode } from "react";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Spinner } from "@/components/ui/spinner";
import { DataFreshness } from "@/components/ui/realtime";

interface ResourceListHeaderProps {
  title: string;
  description?: string;
  isFetching?: boolean;
  isLoading?: boolean;
  onRefresh: () => void;
  actions?: ReactNode;
  /** Timestamp when data was last fetched (from React Query's dataUpdatedAt) */
  dataUpdatedAt?: number;
}

export function ResourceListHeader({
  title,
  description,
  isFetching,
  isLoading,
  onRefresh,
  actions,
  dataUpdatedAt,
}: ResourceListHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{title}</h1>
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
        <DataFreshness dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} />
        <RefreshButton onRefresh={onRefresh} isRefreshing={isFetching} />
      </div>
    </div>
  );
}
