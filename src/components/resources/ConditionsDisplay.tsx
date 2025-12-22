import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  if (conditions.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No conditions</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {conditions.map((condition, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <Badge
                  variant={
                    condition.status === "True" ? "default" : "secondary"
                  }
                >
                  {condition.type_}
                </Badge>
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
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

