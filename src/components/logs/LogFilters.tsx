import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ActiveFilter } from "./types";

interface LogFiltersProps {
  filters: ActiveFilter[];
  onRemoveFilter: (filter: ActiveFilter) => void;
}

export function LogFilters({ filters, onRemoveFilter }: LogFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-2 py-1 border-b bg-muted/30">
      <span className="text-xs text-muted-foreground">Filters:</span>
      <div className="flex flex-wrap gap-1">
        {filters.map((filter, index) => (
          <Badge
            key={`${filter.type}-${filter.key}-${filter.value}-${index}`}
            variant="secondary"
            className="flex items-center gap-1 cursor-pointer hover:bg-destructive/20"
            onClick={() => onRemoveFilter(filter)}
          >
            <span>{filter.label}</span>
            <X className="h-3 w-3" />
          </Badge>
        ))}
      </div>
    </div>
  );
}
