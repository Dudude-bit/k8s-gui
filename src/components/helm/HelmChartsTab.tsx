import { Download, Package, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HelmChartSearchResult } from "@/generated/types";

export interface HelmChartsTabProps {
  searchKeyword: string;
  onSearchKeywordChange: (next: string) => void;
  results: HelmChartSearchResult[];
  isSearching: boolean;
  onSearch: () => void;
  onInstall: (chart: HelmChartSearchResult) => void;
}

export function HelmChartsTab({
  searchKeyword,
  onSearchKeywordChange,
  results,
  isSearching,
  onSearch,
  onInstall,
}: HelmChartsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search charts (e.g., nginx, redis, postgresql)..."
            value={searchKeyword}
            onChange={(e) => onSearchKeywordChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            className="pl-9"
          />
        </div>
        <Button
          onClick={onSearch}
          disabled={isSearching || !searchKeyword.trim()}
        >
          {isSearching ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            "Search"
          )}
        </Button>
      </div>

      {results.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Search for Helm charts</p>
          <p className="text-sm">
            Add repositories first, then search for available charts
          </p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Chart</th>
                <th className="text-left p-3 font-medium">Version</th>
                <th className="text-left p-3 font-medium">App Version</th>
                <th className="text-left p-3 font-medium">Description</th>
                <th className="text-right p-3 font-medium w-[100px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((chart) => (
                <tr
                  key={`${chart.name}-${chart.version}`}
                  className="border-b last:border-0"
                >
                  <td className="p-3 font-medium">{chart.name}</td>
                  <td className="p-3 text-muted-foreground">{chart.version}</td>
                  <td className="p-3 text-muted-foreground">
                    {chart.appVersion || "-"}
                  </td>
                  <td className="p-3 text-muted-foreground text-sm truncate max-w-[300px]">
                    {chart.description || "-"}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onInstall(chart)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Install
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
