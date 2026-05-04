import {
  ExternalLink,
  FolderGit2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { HelmRepository } from "@/generated/types";
import { cn } from "@/lib/utils";

export interface HelmRepositoriesTabProps {
  repositories: HelmRepository[];
  isLoading: boolean;
  isUpdating: boolean;
  onUpdateAll: () => void;
  onAddRepoClick: () => void;
  onDeleteRepo: (name: string) => void;
}

export function HelmRepositoriesTab({
  repositories,
  isLoading,
  isUpdating,
  onUpdateAll,
  onAddRepoClick,
  onDeleteRepo,
}: HelmRepositoriesTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage Helm chart repositories
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onUpdateAll}
            disabled={isUpdating}
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-2", isUpdating && "animate-spin")}
            />
            Update All
          </Button>
          <Button size="sm" onClick={onAddRepoClick}>
            <Plus className="h-4 w-4 mr-2" />
            Add Repository
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading repositories...
        </div>
      ) : repositories.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FolderGit2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No repositories configured</p>
          <p className="text-sm">Add a Helm chart repository to get started</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">URL</th>
                <th className="text-right p-3 font-medium w-[100px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {repositories.map((repo) => (
                <tr key={repo.name} className="border-b last:border-0">
                  <td className="p-3 font-medium">{repo.name}</td>
                  <td className="p-3 text-muted-foreground">
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline inline-flex items-center gap-1"
                    >
                      {repo.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDeleteRepo(repo.name)}
                    >
                      <Trash2 className="h-4 w-4" />
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
