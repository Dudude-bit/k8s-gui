import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Box,
  Network,
  Database,
  FileText,
  Server,
  Activity,
  Package,
  Settings,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import { useEffect, useState } from "react";

const navItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  {
    icon: Box,
    label: "Workloads",
    path: "/workloads",
    children: [
      { label: "Pods", path: "/workloads/pods" },
      { label: "Deployments", path: "/workloads/deployments" },
      { label: "StatefulSets", path: "/workloads/statefulsets" },
      { label: "DaemonSets", path: "/workloads/daemonsets" },
      { label: "Jobs", path: "/workloads/jobs" },
      { label: "CronJobs", path: "/workloads/cronjobs" },
    ],
  },
  {
    icon: Network,
    label: "Network",
    path: "/network",
    children: [
      { label: "Services", path: "/network/services" },
      { label: "Ingresses", path: "/network/ingresses" },
      { label: "Endpoints", path: "/network/endpoints" },
    ],
  },
  {
    icon: Database,
    label: "Storage",
    path: "/storage",
    children: [
      { label: "PersistentVolumes", path: "/storage/pvs" },
      { label: "PersistentVolumeClaims", path: "/storage/pvcs" },
      { label: "StorageClasses", path: "/storage/classes" },
    ],
  },
  {
    icon: FileText,
    label: "Configuration",
    path: "/configuration",
    children: [
      { label: "ConfigMaps", path: "/configuration/configmaps" },
      { label: "Secrets", path: "/configuration/secrets" },
      { label: "Builder", path: "/configuration/builder" },
    ],
  },
  { icon: Server, label: "Nodes", path: "/nodes" },
  { icon: Activity, label: "Events", path: "/events" },
  { icon: Package, label: "Helm", path: "/helm" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export function Sidebar() {
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const location = useLocation();
  const { data: appInfo } = useQuery({
    queryKey: ["appInfo"],
    queryFn: commands.getAppInfo,
    staleTime: Infinity,
  });

  useEffect(() => {
    const activeParents = navItems
      .filter((item) => item.children)
      .filter((item) => {
        if (
          location.pathname === item.path ||
          location.pathname.startsWith(`${item.path}/`)
        ) {
          return true;
        }
        return item.children?.some(
          (child) =>
            location.pathname === child.path ||
            location.pathname.startsWith(`${child.path}/`)
        );
      })
      .map((item) => item.label);

    if (activeParents.length === 0) {
      return;
    }

    setExpandedItems((prev) => {
      const next = new Set(prev);
      activeParents.forEach((label) => next.add(label));
      return Array.from(next);
    });
  }, [location.pathname]);

  const toggleExpanded = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label]
    );
  };

  return (
    <aside className="flex w-56 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
          <span className="text-lg font-bold text-primary-foreground">K8</span>
        </div>
        <span className="font-semibold">K8s GUI</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-2">
        {navItems.map((item) => (
          <div key={item.label}>
            {item.children ? (
              <>
                <button
                  onClick={() => toggleExpanded(item.label)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      expandedItems.includes(item.label) && "rotate-180"
                    )}
                  />
                </button>
                {expandedItems.includes(item.label) && (
                  <div className="ml-4 border-l border-border pl-4">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        className={({ isActive }) =>
                          cn(
                            "block py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                            isActive && "font-medium text-primary"
                          )
                        }
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    isActive && "bg-accent text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )}
          </div>
        ))}
      </nav>

      {/* Version */}
      <div className="border-t border-border p-4 text-xs text-muted-foreground">
        {appInfo?.version ?? "..."}
      </div>
    </aside>
  );
}
