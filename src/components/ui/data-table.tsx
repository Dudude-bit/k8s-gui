import * as React from "react";
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
import { ChevronLeft, ChevronRight, Search, AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  isFetching?: boolean;
  searchKey?: string;
  searchPlaceholder?: string;
  /** Enable virtual scrolling for large datasets (default: true for >100 rows) */
  enableVirtualScroll?: boolean;
  /** Max height for virtual scroll container (default: 600px) */
  virtualScrollHeight?: number;
}

// Extended page size options for large datasets
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200, 500];
const LARGE_DATASET_THRESHOLD = 100;
const VIRTUAL_SCROLL_DEFAULT_HEIGHT = 600;

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  isFetching = false,
  searchKey,
  searchPlaceholder = "Search...",
  enableVirtualScroll,
  virtualScrollHeight = VIRTUAL_SCROLL_DEFAULT_HEIGHT,
}: DataTableProps<TData, TValue>) {
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
  const pageRows = table.getRowModel().rows.length;
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
        className={cn(
          "rounded-md border transition-opacity duration-200",
          isFetching && "opacity-60"
        )}
        aria-busy={isFetching}
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
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
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
