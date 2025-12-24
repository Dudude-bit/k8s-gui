import { ConditionBadge } from "@/components/ui/status-badge";
import { MetadataCard } from "./MetadataCard";

export interface Condition {
  type_: string;
  status: string;
  reason?: string | null;
  message?: string | null;
  last_transition_time?: string | null;
}

interface ConditionsDisplayProps {
  conditions: Condition[];
  title?: string;
  className?: string;
}

export function ConditionsDisplay({
  conditions,
  title = "Conditions",
  className,
}: ConditionsDisplayProps) {
  return (
    <MetadataCard
      title={title}
      items={conditions}
      emptyMessage="No conditions"
      className={className}
      itemsContainerClassName="space-y-2"
      renderItem={(condition, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between rounded-lg border p-3"
        >
          <div className="flex items-center gap-3">
            <ConditionBadge
              conditionStatus={condition.status}
              conditionType={condition.type_}
            />
            <span className="text-sm text-muted-foreground">
              {condition.message || condition.reason || "-"}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {condition.last_transition_time
              ? new Date(condition.last_transition_time).toLocaleString()
              : "-"}
          </span>
        </div>
      )}
    />
  );
}
