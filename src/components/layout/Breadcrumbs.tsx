import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDisplayPlural } from "@/lib/resource-registry";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  className?: string;
}

/**
 * Auto-generate breadcrumbs from current URL path
 * Format: /pods/namespace/pod-name -> Pods > namespace > pod-name
 */
function generateBreadcrumbsFromPath(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  const items: BreadcrumbItem[] = [];
  let currentPath = "";

  // Map for non-resource navigation paths
  const navLabels: Record<string, string> = {
    workloads: "Workloads",
    network: "Network",
    storage: "Storage",
    configuration: "Configuration",
    helm: "Helm",
    settings: "Settings",
  };

  // Get label for a path segment
  const getLabel = (segment: string): string => {
    const lower = segment.toLowerCase();
    // Check navigation paths first, then resource registry
    return navLabels[lower] ?? getDisplayPlural(lower);
  };

  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;

    // For the last segment, don't add href (current page)
    const isLast = index === segments.length - 1;

    // Get display label
    const label = getLabel(segment);

    items.push({
      label,
      href: isLast ? undefined : currentPath,
    });
  });

  return items;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const location = useLocation();

  // Use provided items or auto-generate from path
  const breadcrumbItems = items || generateBreadcrumbsFromPath(location.pathname);

  if (breadcrumbItems.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center text-sm text-muted-foreground", className)}
    >
      <ol className="flex items-center gap-1">
        {/* Home link */}
        <li>
          <Link
            to="/"
            className="flex items-center hover:text-foreground transition-colors"
          >
            <Home className="h-4 w-4" />
          </Link>
        </li>

        {breadcrumbItems.map((item, index) => (
          <li key={index} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            {item.href ? (
              <Link
                to={item.href}
                className="hover:text-foreground transition-colors truncate max-w-[200px]"
                title={item.label}
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-foreground font-medium truncate max-w-[200px]" title={item.label}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
