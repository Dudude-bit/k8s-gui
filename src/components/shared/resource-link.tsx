// src/components/shared/resource-link.tsx
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { getResourceIcon } from "@/lib/resource-registry";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import { cn } from "@/lib/utils";

interface ResourceLinkProps {
  kind: string;
  name: string;
  namespace?: string;
  className?: string;
  showKindBadge?: boolean;
  /** Additional info to display (e.g., container name) */
  subtitle?: string;
}

export function ResourceLink({
  kind,
  name,
  namespace,
  className,
  showKindBadge = true,
  subtitle,
}: ResourceLinkProps) {
  const Icon = getResourceIcon(kind);
  const path = getResourceDetailUrl(kind, name, namespace);

  return (
    <Link
      to={path}
      className={cn(
        "flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent transition-colors",
        className
      )}
    >
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="font-medium truncate">{name}</span>
        {subtitle && (
          <span className="text-xs text-muted-foreground truncate">{subtitle}</span>
        )}
      </div>
      {showKindBadge && (
        <Badge variant="outline" className="ml-auto text-xs shrink-0">
          {kind}
        </Badge>
      )}
    </Link>
  );
}
