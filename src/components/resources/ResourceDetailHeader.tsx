import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { RefreshButton } from "@/components/ui/refresh-button";

interface ResourceDetailHeaderProps {
  title: string;
  namespace?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  onBack: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  icon?: ReactNode;
}

export function ResourceDetailHeader({
  title,
  namespace,
  badges,
  actions,
  onBack,
  onRefresh,
  isRefreshing,
  icon,
}: ResourceDetailHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {icon && <div className="h-8 w-8 text-muted-foreground">{icon}</div>}
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {namespace && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{namespace}</span>
              {badges}
            </div>
          )}
          {!namespace && badges && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {badges}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {onRefresh && (
          <RefreshButton onRefresh={onRefresh} isRefreshing={isRefreshing} />
        )}
      </div>
    </div>
  );
}

