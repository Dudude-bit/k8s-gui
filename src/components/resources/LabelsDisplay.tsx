import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LabelsDisplayProps {
  labels: Record<string, string>;
  title?: string;
  emptyMessage?: string;
  className?: string;
}

export function LabelsDisplay({
  labels,
  title = "Labels",
  emptyMessage = "No labels",
  className,
}: LabelsDisplayProps) {
  const entries = Object.entries(labels);

  if (entries.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{emptyMessage}</p>
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
        <div className="flex flex-wrap gap-2">
          {entries.map(([key, value]) => (
            <Badge
              key={key}
              variant="outline"
              className="font-mono text-xs"
            >
              {key}={value}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

