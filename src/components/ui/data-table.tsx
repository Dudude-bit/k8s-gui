import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { QuickActions, type QuickAction } from "@/components/ui/quick-actions";
import { useTableKeyboardNav } from "@/hooks/useTableKeyboardNav";
import { ChevronLeft, ChevronRight, Search, AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  searchKey?: string;
  searchPlaceholder?: string;
  /** Enable virtual scrolling for large datasets (default: true for >100 rows) */
  enableVirtualScroll?: boolean;
  /** Max height for virtual scroll container (default: 600px) */
  virtualScrollHeight?: number;
  /** Generate navigation URL for row click */
  getRowHref?: (row: TData) => string;
  /** Custom row click handler (alternative to getRowHref) */
  onRowClick?: (row: TData) => void;
  /** Quick actions shown on row hover */
  quickActions?: QuickAction<TData>[];
  /** Enable keyboard navigation (default: true if getRowHref or onRowClick provided) */
  enableKeyboardNav?: boolean;
  /** Function to get unique row ID (for stable keys during data updates) */
  getRowId?: (row: TData, index: number) => string;
}

// Extended page size options for large datasets
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200, 500];
const LARGE_DATASET_THRESHOLD = 100;
const VIRTUAL_SCROLL_DEFAULT_HEIGHT = 600;

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  searchKey,
  searchPlaceholder = "Search...",
  enableVirtualScroll,
  virtualScrollHeight = VIRTUAL_SCROLL_DEFAULT_HEIGHT,
  getRowHref,
  onRowClick,
  quickActions,
  enableKeyboardNav,
  getRowId,
}: DataTableProps<TData, TValue>) {
  const navigate = useNavigate();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [searchValue, setSearchValue] = React.useState("");
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 25,
  });
  const [hoveredRowIndex, setHoveredRowIndex] = React.useState<number | null>(null);
  const deferredSearch = React.useDeferredValue(searchValue);

  // Determine if we should use virtual scroll based on data size
  const shouldVirtualScroll =
    enableVirtualScroll ?? data.length > LARGE_DATASET_THRESHOLD;
  const isShowingAllRows = pagination.pageSize >= data.length;
  const showLargeDatasetWarning =
    isShowingAllRows && data.length > LARGE_DATASET_THRESHOLD;

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      pagination,
    },
  });

  const rows = table.getRowModel().rows;
  const isClickable = !!(getRowHref || onRowClick);
  const keyboardNavEnabled = enableKeyboardNav ?? isClickable;

  // Keyboard navigation
  const { containerRef, focusedRowIndex, getRowProps } = useTableKeyboardNav({
    rowCount: rows.length,
    getRowHref: getRowHref
      ? (index) => {
          const row = rows[index];
          return row ? getRowHref(row.original) : undefined;
        }
      : undefined,
    onRowAction: onRowClick
      ? (index) => {
          const row = rows[index];
          if (row) onRowClick(row.original);
        }
      : undefined,
    enabled: keyboardNavEnabled,
  });

  React.useEffect(() => {
    const searchColumn = searchKey ? table.getColumn(searchKey) : undefined;

    if (searchColumn) {
      searchColumn.setFilterValue(deferredSearch);
      setGlobalFilter("");
    } else {
      setGlobalFilter(deferredSearch);
    }

    table.setPageIndex(0);
  }, [deferredSearch, searchKey, table]);

  const filteredRows = table.getFilteredRowModel().rows.length;
  const totalRows = data.length;
  const pageRows = rows.length;
  const pageStart =
    totalRows === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const pageEnd = totalRows === 0 ? 0 : pageStart + pageRows - 1;

  // Handle "All" page size
  const handlePageSizeChange = (value: string) => {
    if (value === "all") {
      table.setPageSize(data.length || 1000);
    } else {
      table.setPageSize(Number(value));
    }
    table.setPageIndex(0);
  };

  // Handle row click
  const handleRowClick = (row: TData, event: React.MouseEvent) => {
    // Don't navigate if clicking on interactive elements
    const target = event.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("a") ||
      target.closest('[role="menuitem"]') ||
      target.closest('[data-quick-actions]')
    ) {
      return;
    }

    if (getRowHref) {
      navigate(getRowHref(row));
    } else if (onRowClick) {
      onRowClick(row);
    }
  };

  // Get current page size display value
  const currentPageSizeValue = isShowingAllRows
    ? "all"
    : String(pagination.pageSize);

  if (isLoading) {
    return <TableSkeleton columns={columns.length} rows={5} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            className="pl-8"
          />
        </div>
        {showLargeDatasetWarning && (
          <div className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Showing all {data.length} rows may affect performance</span>
          </div>
        )}
      </div>
      <div
        ref={containerRef}
        className="rounded-md border"
        role={keyboardNavEnabled ? "grid" : undefined}
        aria-label={keyboardNavEnabled ? "Data table" : undefined}
      >
        {/* Use scrollable container for large datasets when showing all rows */}
        <div
          className={cn(
            shouldVirtualScroll &&
            isShowingAllRows &&
            "overflow-auto scrollbar-thin"
          )}
          style={
            shouldVirtualScroll && isShowingAllRows
              ? { maxHeight: virtualScrollHeight }
              : undefined
          }
        >
          <Table>
            <TableHeader
              className={cn(
                shouldVirtualScroll &&
                isShowingAllRows &&
                "sticky top-0 bg-background z-10"
              )}
            >
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row, index) => {
                  const rowProps = keyboardNavEnabled ? getRowProps(index) : {};
                  const isFocused = focusedRowIndex === index;
                  const isHovered = hoveredRowIndex === index;

                  return (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                      {...rowProps}
                      className={cn(
                        isClickable && "cursor-pointer",
                        isFocused && "ring-2 ring-ring ring-inset",
                        "relative group"
                      )}
                      onClick={isClickable ? (e) => handleRowClick(row.original, e) : undefined}
                      onMouseEnter={() => setHoveredRowIndex(index)}
                      onMouseLeave={() => setHoveredRowIndex(null)}
                    >
                      {row.getVisibleCells().map((cell, cellIndex) => (
                        <TableCell key={cell.id} className="relative">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                          {/* Render quick actions in the last cell before actions column */}
                          {quickActions &&
                            cellIndex === row.getVisibleCells().length - 2 && (
                              <div
                                data-quick-actions
                                className="absolute right-0 top-1/2 -translate-y-1/2 pr-2"
                              >
                                <QuickActions
                                  item={row.original}
                                  actions={quickActions}
                                  visible={isHovered || isFocused}
                                />
                              </div>
                            )}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredRows === totalRows
            ? `${totalRows} row(s)`
            : `${filteredRows} of ${totalRows} row(s)`}
          {totalRows > 0 && !isShowingAllRows && (
            <span className="ml-2">
              Showing {pageStart}-{pageEnd}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={currentPageSizeValue}
            onValueChange={handlePageSizeChange}
          >
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue placeholder="Rows" />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option} / page
                </SelectItem>
              ))}
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
