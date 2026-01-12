import { ReactNode } from "react";
import { RefreshButton } from "@/components/ui/refresh-button";
import { DataFreshness } from "@/components/ui/realtime";

interface ResourceListHeaderProps {
  title: string;
  description?: string;
  onRefresh: () => void;
  actions?: ReactNode;
  /** Timestamp when data was last fetched (from React Query's dataUpdatedAt) */
  dataUpdatedAt?: number;
}

export function ResourceListHeader({
  title,
  description,
  onRefresh,
  actions,
  dataUpdatedAt,
}: ResourceListHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <DataFreshness dataUpdatedAt={dataUpdatedAt} />
        <RefreshButton onRefresh={onRefresh} />
      </div>
    </div>
  );
}
