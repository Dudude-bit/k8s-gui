import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReactNode } from "react";

export interface MetadataCardProps<T> {
  /** Card title */
  title: string;
  /** Items to display */
  items: T[];
  /** Message to show when items array is empty */
  emptyMessage?: string;
  /** Render function for each item */
  renderItem: (item: T, index: number) => ReactNode;
  /** Container className for items */
  itemsContainerClassName?: string;
  /** Optional className for the card */
  className?: string;
}

/**
 * Generic card component for displaying metadata items.
 * Used as a base for LabelsDisplay, ConditionsDisplay, and similar components.
 */
export function MetadataCard<T>({
  title,
  items,
  emptyMessage = "No items",
  renderItem,
  itemsContainerClassName = "space-y-2",
  className,
}: MetadataCardProps<T>) {
  if (items.length === 0) {
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
        <div className={itemsContainerClassName}>
          {items.map((item, index) => renderItem(item, index))}
        </div>
      </CardContent>
    </Card>
  );
}




