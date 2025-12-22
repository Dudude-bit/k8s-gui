import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ButtonProps } from "@/components/ui/button";

interface RefreshButtonProps extends Omit<ButtonProps, "onClick"> {
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function RefreshButton({
  onRefresh,
  isRefreshing,
  variant = "outline",
  size = "icon",
  className,
  ...props
}: RefreshButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      onClick={onRefresh}
      disabled={isRefreshing}
      className={className}
      {...props}
    >
      <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
    </Button>
  );
}

