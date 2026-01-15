import * as React from "react";
import { hashString, cn } from "@/lib/utils";
import { Badge } from "./badge";
import { useThemeStore } from "@/stores/themeStore";

interface NodeBadgeProps {
  /** The node name to display and generate color from */
  nodeName: string;
  className?: string;
  /** Max width before truncation (default: max-w-[200px]) */
  maxWidth?: string;
}

/**
 * Badge component for displaying Kubernetes node names with consistent coloring.
 * Generates a stable color based on the node name hash, making it easy to
 * visually identify pods running on the same node.
 */
export function NodeBadge({ nodeName, className, maxWidth = "max-w-[200px]" }: NodeBadgeProps) {
  const { theme } = useThemeStore();
  const hue = React.useMemo(() => hashString(nodeName) % 360, [nodeName]);

  const isDark = React.useMemo(() => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return theme === "dark";
  }, [theme]);

  const style: React.CSSProperties = isDark
    ? {
        backgroundColor: `hsl(${hue} 50% 25%)`,
        color: `hsl(${hue} 60% 75%)`,
        borderColor: "transparent",
      }
    : {
        backgroundColor: `hsl(${hue} 60% 90%)`,
        color: `hsl(${hue} 70% 30%)`,
        borderColor: "transparent",
      };

  return (
    <Badge
      className={cn("truncate", maxWidth, className)}
      style={style}
      title={nodeName}
    >
      {nodeName}
    </Badge>
  );
}
