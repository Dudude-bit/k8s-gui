import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

/**
 * Skeleton for table rows
 */
interface TableSkeletonProps {
  columns?: number;
  rows?: number;
  showSearch?: boolean;
}

function TableSkeleton({
  columns = 4,
  rows = 5,
  showSearch = true,
}: TableSkeletonProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {showSearch && <Skeleton className="h-10 w-64" />}

      <div className="rounded-md border">
        <div className="border-b">
          <div className="flex h-12 items-center gap-4 px-4">
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-24" />
            ))}
          </div>
        </div>

        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex h-16 items-center gap-4 border-b px-4 last:border-0"
          >
            {Array.from({ length: columns }).map((_, j) => (
              <Skeleton key={j} className="h-4 w-24" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for card content
 */
interface CardSkeletonProps {
  showHeader?: boolean;
  lines?: number;
}

function CardSkeleton({ showHeader = true, lines = 3 }: CardSkeletonProps) {
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-3">
      {showHeader && (
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-6 w-6 rounded-full" />
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn("h-4", i === lines - 1 ? "w-[70%]" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for detail pages
 */
interface DetailSkeletonProps {
  rows?: number;
  showHeader?: boolean;
}

function DetailSkeleton({ rows = 4, showHeader = true }: DetailSkeletonProps) {
  return (
    <DetailTabsSkeleton tabCount={3} rows={rows} showHeader={showHeader} />
  );
}

/**
 * Skeleton for detail pages with tabs
 */
interface DetailTabsSkeletonProps {
  tabCount?: number;
  rows?: number;
  showHeader?: boolean;
}

function DetailTabsSkeleton({
  tabCount = 4,
  rows = 4,
  showHeader = true,
}: DetailTabsSkeletonProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {showHeader && (
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-64" />
        </div>
      )}

      <div className="flex gap-2">
        {Array.from({ length: tabCount }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20" />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: rows }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for stats cards grid
 */
interface StatsSkeletonProps {
  count?: number;
}

function StatsSkeleton({ count = 4 }: StatsSkeletonProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border bg-card text-card-foreground shadow-sm p-6 space-y-3"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>
          <Skeleton className="h-7 w-[60px]" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-[70px]" />
            <Skeleton className="h-5 w-[70px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton for pages with a header and stats cards
 */
interface HeaderStatsSkeletonProps {
  stats?: number;
}

function HeaderStatsSkeleton({ stats = 4 }: HeaderStatsSkeletonProps) {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-8 w-64" />
      </div>
      <StatsSkeleton count={stats} />
    </div>
  );
}

/**
 * Skeleton for page headers with optional subtitle
 */
interface HeaderSkeletonProps {
  showSubtitle?: boolean;
}

function HeaderSkeleton({ showSubtitle = true }: HeaderSkeletonProps) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-48" />
      {showSubtitle && <Skeleton className="h-4 w-72" />}
    </div>
  );
}

/**
 * Skeleton for list items
 */
interface ListSkeletonProps {
  count?: number;
  showIcon?: boolean;
}

function ListSkeleton({ count = 5, showIcon = true }: ListSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-md border">
          {showIcon && <Skeleton className="h-10 w-10 rounded-full" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton for a text block/paragraph
 */
interface TextSkeletonProps {
  lines?: number;
}

function TextSkeleton({ lines = 3 }: TextSkeletonProps) {
  const widths = ["w-full", "w-[92%]", "w-[96%]", "w-[88%]"];

  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === lines - 1 ? "w-[70%]" : widths[i % widths.length]
          )}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton for page loading (full page placeholder)
 */
interface PageSkeletonProps {
  className?: string;
}

function PageSkeleton({ className }: PageSkeletonProps) {
  return (
    <div
      className={cn("space-y-6 animate-in fade-in duration-200 p-4", className)}
    >
      <Skeleton className="h-8 w-52" />

      <StatsSkeleton count={4} />

      <div className="grid gap-4 md:grid-cols-2">
        <CardSkeleton lines={5} />
        <CardSkeleton lines={5} />
      </div>
    </div>
  );
}

export {
  Skeleton,
  TableSkeleton,
  CardSkeleton,
  DetailSkeleton,
  DetailTabsSkeleton,
  StatsSkeleton,
  HeaderStatsSkeleton,
  HeaderSkeleton,
  ListSkeleton,
  TextSkeleton,
  PageSkeleton,
};
