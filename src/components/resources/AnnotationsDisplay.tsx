import { MetadataCard } from "./MetadataCard";

interface AnnotationsDisplayProps {
    annotations: Record<string, string>;
    title?: string;
    emptyMessage?: string;
    className?: string;
}

/**
 * Display component for Kubernetes annotations.
 * Shows key-value pairs in a card with proper formatting for long values.
 */
export function AnnotationsDisplay({
    annotations,
    title = "Annotations",
    emptyMessage = "No annotations",
    className,
}: AnnotationsDisplayProps) {
    const entries = Object.entries(annotations);

    return (
        <MetadataCard
            title={title}
            items={entries}
            emptyMessage={emptyMessage}
            className={className}
            itemsContainerClassName="space-y-2"
            renderItem={([key, value]) => (
                <div key={key} className="rounded-lg border p-2">
                    <p className="text-xs font-medium text-muted-foreground">{key}</p>
                    <p className="font-mono text-sm break-all">{value}</p>
                </div>
            )}
        />
    );
}
