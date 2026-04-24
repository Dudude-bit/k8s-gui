import { Badge } from "@/components/ui/badge";
import { MetadataCard } from "./MetadataCard";

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

  return (
    <MetadataCard
      title={title}
      items={entries}
      emptyMessage={emptyMessage}
      className={className}
      itemsContainerClassName="flex flex-wrap gap-2"
      renderItem={([key, value]) => (
        <Badge key={key} variant="outline" className="font-mono text-xs">
          {key}={value}
        </Badge>
      )}
    />
  );
}
