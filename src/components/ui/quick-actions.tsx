import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuickAction<T> {
  /** Icon to display */
  icon: LucideIcon;
  /** Tooltip label */
  label: string;
  /** Click handler */
  onClick: (item: T) => void;
  /** Button variant */
  variant?: "default" | "destructive" | "ghost";
  /** Condition to hide action */
  hidden?: (item: T) => boolean;
  /** Condition to disable action */
  disabled?: (item: T) => boolean;
}

interface QuickActionsProps<T> {
  /** Item data */
  item: T;
  /** List of quick actions */
  actions: QuickAction<T>[];
  /** Whether actions are visible */
  visible: boolean;
  /** Additional class names */
  className?: string;
}

export function QuickActions<T>({
  item,
  actions,
  visible,
  className,
}: QuickActionsProps<T>) {
  const visibleActions = actions.filter((action) => !action.hidden?.(item));

  if (visibleActions.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 transition-opacity duration-150",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {visibleActions.map((action) => {
        const isDisabled = action.disabled?.(item);
        const Icon = action.icon;

        return (
          <Tooltip key={action.label}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7",
                  action.variant === "destructive" &&
                    "text-destructive hover:text-destructive hover:bg-destructive/10"
                )}
                disabled={isDisabled}
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick(item);
                }}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {action.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

// Helper to create common quick actions
export function createViewAction<T>(
  onClick: (item: T) => void,
  icon?: LucideIcon
): QuickAction<T> {
  const Eye = require("lucide-react").Eye as LucideIcon;
  return {
    icon: icon ?? Eye,
    label: "View Details",
    onClick,
  };
}

export function createDeleteAction<T>(
  onClick: (item: T) => void
): QuickAction<T> {
  const Trash2 = require("lucide-react").Trash2 as LucideIcon;
  return {
    icon: Trash2,
    label: "Delete",
    onClick,
    variant: "destructive",
  };
}

export function createEditAction<T>(onClick: (item: T) => void): QuickAction<T> {
  const Pencil = require("lucide-react").Pencil as LucideIcon;
  return {
    icon: Pencil,
    label: "Edit",
    onClick,
  };
}
