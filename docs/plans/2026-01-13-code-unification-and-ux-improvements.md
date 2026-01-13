# Code Unification and UX Improvements Design

**Date:** 2026-01-13
**Status:** Approved

## Overview

This document describes a set of improvements to the k8s-gui project covering:
- Code unification and DRY principles
- Bug fixes and technical debt reduction
- UI/UX improvements

## 1. ResourceList Component Factory

### Problem

15 list components (PodList, DeploymentList, StatefulSetList, etc.) contain nearly identical code (~130-150 lines each):

```typescript
// Every list repeats:
const { currentNamespace } = useClusterStore();
const { hasAccess } = usePremiumFeature();
const { data: podsWithMetrics } = usePodsWithMetrics();
const query = useResourceList([...], () => commands.listX({...}));
const withMetrics = useMemo(() => attachAggregatedPodMetrics(...), [...]);
return <ResourceList ... />
```

### Solution

Create a generic factory `createResourceListComponent`:

```typescript
// src/components/resources/createResourceListComponent.tsx
export function createResourceListComponent<T>(config: {
  resourceType: ResourceType;
  listCommand: (params: { namespace?: string }) => Promise<T[]>;
  columns: (hasMetricsAccess: boolean) => ColumnDef<T>[];
  title: string;
  matchPodsFn?: (resource: T, pods: PodWithMetrics[]) => PodWithMetrics[];
  supportsMetrics?: boolean;
}) {
  return function ResourceListComponent() {
    const { currentNamespace } = useClusterStore();
    const { hasAccess } = usePremiumFeature(PremiumFeature.Metrics);
    const { data: podsWithMetrics, status: podStatus } = usePodsWithMetrics();

    const query = useResourceList(
      queryKeys.resource(config.resourceType, currentNamespace),
      () => config.listCommand({ namespace: currentNamespace || undefined })
    );

    const dataWithMetrics = useMemo(() => {
      if (!config.supportsMetrics || !config.matchPodsFn) {
        return query.data;
      }
      return attachAggregatedPodMetrics(
        query.data,
        podsWithMetrics,
        config.matchPodsFn
      );
    }, [query.data, podsWithMetrics]);

    return (
      <>
        {config.supportsMetrics && <MetricsStatusBanner status={podStatus} />}
        <ResourceList
          data={dataWithMetrics}
          columns={config.columns(hasAccess)}
          title={config.title}
          isLoading={query.isLoading}
          error={query.error}
          // ... other props
        />
      </>
    );
  };
}
```

### Usage

```typescript
// src/components/resources/DeploymentList.tsx
export const DeploymentList = createResourceListComponent({
  resourceType: ResourceType.Deployment,
  listCommand: commands.listDeployments,
  columns: createDeploymentColumns,
  title: "Deployments",
  matchPodsFn: matchDeploymentPods,
  supportsMetrics: true,
});
```

### Impact

- Reduces ~2000 lines of duplicated code
- Single point of maintenance for list behavior
- Consistent behavior across all resource lists

---

## 2. Additional Column Factories

### Problem

`columns.tsx` has factories for name, namespace, age, cpu, memory, replicas. But code repeats for:
- Status columns (with colored badges)
- Labels columns (with truncation)
- Schedule columns (for CronJobs)
- Ready/Available columns

### Solution

Add missing factories to `src/components/resources/columns.tsx`:

```typescript
// Status with colored badge
export function createStatusColumn<T>(
  accessor: (row: T) => string,
  options?: { header?: string }
): ColumnDef<T> {
  return {
    id: "status",
    accessorFn: accessor,
    header: options?.header ?? "Status",
    cell: ({ row }) => <StatusBadge status={accessor(row.original)} />,
  };
}

// Labels with hover for full list
export function createLabelsColumn<T>(
  accessor: (row: T) => Record<string, string> | undefined
): ColumnDef<T> {
  return {
    id: "labels",
    accessorFn: accessor,
    header: "Labels",
    cell: ({ row }) => (
      <LabelsCell labels={accessor(row.original)} maxVisible={2} />
    ),
  };
}

// Schedule for CronJobs
export function createScheduleColumn<T>(
  accessor: (row: T) => string
): ColumnDef<T> {
  return {
    id: "schedule",
    accessorFn: accessor,
    header: "Schedule",
    cell: ({ row }) => (
      <code className="text-xs bg-muted px-1 rounded">
        {accessor(row.original)}
      </code>
    ),
  };
}

// Ready/Available column for workloads
export function createReadyColumn<T>(
  readyAccessor: (row: T) => number,
  desiredAccessor: (row: T) => number
): ColumnDef<T> {
  return {
    id: "ready",
    header: "Ready",
    cell: ({ row }) => {
      const ready = readyAccessor(row.original);
      const desired = desiredAccessor(row.original);
      const isHealthy = ready === desired;
      return (
        <span className={isHealthy ? "text-green-500" : "text-yellow-500"}>
          {ready}/{desired}
        </span>
      );
    },
  };
}
```

### Impact

- Uniform display of statuses, labels, and other frequently used data
- Easier to add new columns consistently

---

## 3. Bug Fixes

### Bug 1: Duplicate State in authStore

**File:** `src/stores/authStore.ts`

**Problem:**
```typescript
user: UserProfile | null;
userProfile: UserProfile | null;  // Duplicate!
```

**Solution:** Remove `userProfile`, keep only `user`. Update all usages.

---

### Bug 2: Race Condition in License Initialization

**File:** `src/stores/authStore.ts`

**Problem:**
```typescript
initializeAuth: async () => {
  // ...
  get().checkLicenseStatus();  // Fire-and-forget
}
```

**Solution:**
```typescript
initializeAuth: async () => {
  // ...
  await get().checkLicenseStatus();  // Wait for result
}
```

---

### Bug 3: Inconsistent Query Keys

**Problem:**
```typescript
// Different places use:
queryKey: ["statefulsets", namespace]      // string
queryKey: [ResourceType.StatefulSet, ...]  // enum

// null vs undefined inconsistency:
queryKey: ["pods", namespace ?? null]  // sometimes null
queryKey: ["pods", namespace]          // sometimes undefined
```

**Solution:** Create query keys utility:

```typescript
// src/lib/query-keys.ts
export const queryKeys = {
  resource: (type: ResourceType, namespace?: string) =>
    [type, namespace ?? "all"] as const,

  resourceDetail: (type: ResourceType, namespace: string, name: string) =>
    [type, namespace, name] as const,

  metrics: (type: "pods" | "nodes" | "cluster", namespace?: string) =>
    ["metrics", type, namespace ?? "all"] as const,

  events: (namespace?: string) =>
    ["events", namespace ?? "all"] as const,
} as const;
```

---

### Bug 4: Inconsistent Error Handling in Detail Pages

**Problem:** Some pages check `if (!resource && !isLoading && !error) return null`, some don't.

**Solution:** Add to `useResourceDetail` hook:

```typescript
// In useResourceDetail return:
return {
  // ... existing fields
  notFound: !resource && !isLoading && !error,
};

// Or create ResourceDetailGuard component:
export function ResourceDetailGuard({
  resource,
  isLoading,
  error,
  children
}: Props) {
  if (isLoading) return <DetailSkeleton />;
  if (error) return <ErrorDisplay error={error} />;
  if (!resource) return <NotFound />;
  return children;
}
```

---

## 4. UI/UX Improvements

### Improvement 1: Combined Loading State for Metrics

**File:** `src/hooks/useMetrics.ts`

**Problem:** Returns individual query objects without combined loading state.

**Solution:**
```typescript
return {
  podMetricsQuery,
  nodeMetricsQuery,
  clusterMetricsQuery,
  // Add computed fields:
  isLoading: podMetricsQuery.isLoading || nodeMetricsQuery.isLoading || clusterMetricsQuery.isLoading,
  isError: podMetricsQuery.isError || nodeMetricsQuery.isError || clusterMetricsQuery.isError,
  isFetching: podMetricsQuery.isFetching || nodeMetricsQuery.isFetching || clusterMetricsQuery.isFetching,
};
```

---

### Improvement 2: Table Skeleton Loading

**Problem:** Empty table or spinner during loading causes layout shift.

**Solution:** Add `TableSkeleton` component:

```typescript
// src/components/ui/table-skeleton.tsx
import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-4 pb-2 border-b">
        {Array.from({ length: columns }).map((_, j) => (
          <Skeleton key={j} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 py-2">
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={j} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
```

---

### Improvement 3: Bulk Operations Feedback

**Problem:** Multiple toasts for bulk operations (e.g., deleting several resources).

**Solution:** Add progress indicator:

```typescript
// src/hooks/useBulkOperation.ts
export function useBulkOperation<T>() {
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const execute = async (items: T[], operation: (item: T) => Promise<void>) => {
    setProgress({ current: 0, total: items.length });

    for (let i = 0; i < items.length; i++) {
      await operation(items[i]);
      setProgress({ current: i + 1, total: items.length });
    }

    toast.success(`Successfully processed ${items.length} resources`);
  };

  return { execute, progress, isRunning: progress.total > 0 };
}
```

---

### Improvement 4: Empty State for Lists

**Problem:** Empty list shows just an empty table without explanation.

**Solution:** Add `EmptyState` component:

```typescript
// src/components/ui/empty-state.tsx
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && (
        <div className="text-muted-foreground mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

Usage in ResourceList:
```typescript
if (data?.length === 0) {
  return (
    <EmptyState
      icon={<Package className="h-12 w-12" />}
      title={`No ${title.toLowerCase()} found`}
      description="Try changing the namespace or create a new resource"
    />
  );
}
```

---

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `src/components/resources/createResourceListComponent.tsx` | Create | New factory function |
| `src/components/resources/columns.tsx` | Extend | Add 4 new column factories |
| `src/components/resources/*List.tsx` | Simplify | 15 files to refactor |
| `src/stores/authStore.ts` | Fix | Remove duplicate state |
| `src/hooks/useResource.ts` | Fix | Improve error handling |
| `src/hooks/useMetrics.ts` | Extend | Add combined loading state |
| `src/lib/query-keys.ts` | Create | New query key utility |
| `src/components/ui/table-skeleton.tsx` | Create | New component |
| `src/components/ui/empty-state.tsx` | Create | New component |
| `src/hooks/useBulkOperation.ts` | Create | New hook |

---

## Implementation Priority

1. **Bug fixes** (critical for stability)
   - authStore duplicate state
   - License race condition

2. **Query keys unification** (foundation for other changes)
   - Create query-keys.ts
   - Update all usages

3. **Column factories** (needed for ResourceList factory)
   - Add new factories to columns.tsx

4. **createResourceListComponent** (main unification)
   - Create factory
   - Refactor all 15 list components

5. **UI/UX improvements**
   - TableSkeleton
   - EmptyState
   - Combined metrics loading
   - Bulk operations feedback

---

## Success Criteria

- [ ] All 15 list components use createResourceListComponent
- [ ] No duplicate state in authStore
- [ ] All query keys use queryKeys utility
- [ ] Tables show skeleton during loading
- [ ] Empty lists show EmptyState component
- [ ] All existing tests pass
- [ ] No TypeScript errors
