/**
 * ResourceDetailLayout - Unified layout for resource detail pages
 *
 * Provides common structure for detail pages including:
 * - Loading state with skeleton
 * - Error state with navigation
 * - Consistent layout structure
 */

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResourceDetailHeader } from "./ResourceDetailHeader";
import { LabelsDisplay } from "./LabelsDisplay";
import { ArrowLeft, AlertCircle, RefreshCw } from "lucide-react";
import { isResourceNotFoundError } from "@/hooks/useResourceDetail";

/**
 * Loading skeleton for detail pages
 */
interface DetailSkeletonProps {
  /** Number of content rows to show */
  rows?: number;
  /** Show header skeleton */
  showHeader?: boolean;
}

export function DetailSkeleton({
  rows = 4,
  showHeader = true,
}: DetailSkeletonProps) {
  return (
    <div className="space-y-4">
      {showHeader && <Skeleton className="h-8 w-64" />}
      <Skeleton className="h-10 w-96" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * Error state for detail pages
 */
interface DetailErrorProps {
  /** Error object or message */
  error: Error | string | null;
  /** Resource kind for display */
  resourceKind: string;
  /** Go back callback */
  onBack: () => void;
  /** Optional: Action to find replacement */
  onFindReplacement?: () => void;
  /** Is searching for replacement */
  isSearching?: boolean;
  /** Additional message */
  additionalMessage?: string;
}

export function DetailError({
  error,
  resourceKind,
  onBack,
  onFindReplacement,
  isSearching,
  additionalMessage,
}: DetailErrorProps) {
  const isNotFound = isResourceNotFoundError(error);

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <p className="text-destructive text-lg font-medium">
        {isNotFound
          ? `${resourceKind} not found`
          : `Failed to load ${resourceKind.toLowerCase()} details`}
      </p>
      {isNotFound && (
        <p className="text-muted-foreground text-sm">
          The {resourceKind.toLowerCase()} may have been deleted or recreated
        </p>
      )}
      {additionalMessage && (
        <p className="text-muted-foreground text-sm">{additionalMessage}</p>
      )}
      {isSearching && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Looking for replacement...</span>
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
        {isNotFound && onFindReplacement && (
          <Button onClick={onFindReplacement} disabled={isSearching}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isSearching ? "animate-spin" : ""}`}
            />
            {isSearching ? "Searching..." : "Find Replacement"}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Info row component for displaying key-value pairs
 */
interface InfoRowProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function InfoRow({ label, value, className }: InfoRowProps) {
  return (
    <div
      className={`flex justify-between items-center py-1 ${className ?? ""}`}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

/**
 * Info card component for grouping related info
 */
interface InfoCardProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function InfoCard({
  title,
  icon,
  children,
  className,
  contentClassName,
}: InfoCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

/**
 * Conditions display component
 */
interface Condition {
  type: string;
  status: string;
  message?: string;
  reason?: string;
  lastTransitionTime?: string;
}

interface ConditionsDisplayProps {
  conditions: Condition[];
  title?: string;
}

export function ConditionsDisplay({
  conditions,
  title = "Conditions",
}: ConditionsDisplayProps) {
  if (!conditions || conditions.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 rounded-md bg-muted/50"
            >
              <div className="flex items-center gap-3">
                <Badge
                  variant={
                    condition.status === "True"
                      ? "default"
                      : condition.status === "False"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {condition.status}
                </Badge>
                <span className="font-medium">{condition.type}</span>
              </div>
              {condition.message && (
                <span className="text-sm text-muted-foreground truncate max-w-[50%]">
                  {condition.message}
                </span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Tab definition for resource detail tabs
 */
export interface DetailTab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Props for ResourceDetailLayout
 */
interface ResourceDetailLayoutProps {
  /** Resource data */
  resource: unknown;
  /** Is loading */
  isLoading: boolean;
  /** Is fetching (background refresh) */
  isFetching?: boolean;
  /** Error state */
  error: Error | string | null;
  /** Resource kind for display */
  resourceKind: string;

  /** Header title */
  title: string;
  /** Namespace */
  namespace?: string;
  /** Status badge */
  statusBadge?: ReactNode;
  /** Additional badges */
  badges?: ReactNode;
  /** Action buttons */
  actions?: ReactNode;
  /** Header icon */
  icon?: ReactNode;

  /** Go back callback */
  onBack: () => void;
  /** Refresh callback */
  onRefresh?: () => void;
  /** Find replacement callback (for pods) */
  onFindReplacement?: () => void;
  /** Is searching for replacement */
  isSearchingReplacement?: boolean;

  /** Tab definitions */
  tabs: DetailTab[];
  /** Active tab */
  activeTab: string;
  /** Set active tab */
  onTabChange: (tab: string) => void;

  /** Labels for LabelsDisplay */
  labels?: Record<string, string>;
  /** Annotations for display */
  annotations?: Record<string, string>;
  /** Conditions for ConditionsDisplay */
  conditions?: Condition[];

  /** Additional content below tabs */
  children?: ReactNode;
}

/**
 * Unified layout component for resource detail pages
 */
export function ResourceDetailLayout({
  resource,
  isLoading,
  isFetching,
  error,
  resourceKind,
  title,
  namespace,
  statusBadge,
  badges,
  actions,
  icon,
  onBack,
  onRefresh,
  onFindReplacement,
  isSearchingReplacement,
  tabs,
  activeTab,
  onTabChange,
  labels,
  annotations,
  conditions,
  children,
}: ResourceDetailLayoutProps) {
  // Loading state
  if (isLoading) {
    return <DetailSkeleton />;
  }

  // Error state
  if (error || !resource) {
    return (
      <DetailError
        error={error}
        resourceKind={resourceKind}
        onBack={onBack}
        onFindReplacement={onFindReplacement}
        isSearching={isSearchingReplacement}
      />
    );
  }

  // Build combined badges
  const allBadges = (
    <>
      {statusBadge}
      {badges}
    </>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <ResourceDetailHeader
        title={title}
        namespace={namespace}
        badges={allBadges}
        actions={actions}
        onBack={onBack}
        onRefresh={onRefresh}
        isRefreshing={isFetching}
        icon={icon}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab contents */}
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="space-y-4">
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>

      {/* Labels section (if on overview tab and labels exist) */}
      {activeTab === "overview" && labels && Object.keys(labels).length > 0 && (
        <LabelsDisplay labels={labels} title="Labels" />
      )}

      {/* Annotations section */}
      {activeTab === "overview" &&
        annotations &&
        Object.keys(annotations).length > 0 && (
          <LabelsDisplay labels={annotations} title="Annotations" />
        )}

      {/* Conditions section */}
      {activeTab === "overview" && conditions && conditions.length > 0 && (
        <ConditionsDisplay conditions={conditions} />
      )}

      {/* Additional children */}
      {children}
    </div>
  );
}

export default ResourceDetailLayout;
