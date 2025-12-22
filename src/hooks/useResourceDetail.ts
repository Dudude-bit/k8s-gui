/**
 * Unified hook for resource detail pages
 * 
 * Provides common functionality for all detail pages including:
 * - Resource data fetching with loading/error states
 * - YAML fetching for YAML tab
 * - Tab management
 * - Navigation helpers
 * - Copy to clipboard
 */

import { useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "@/components/ui/use-toast";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

export interface UseResourceDetailOptions<T> {
  /** Resource kind for YAML command (e.g., "Pod", "Deployment") */
  resourceKind: string;
  /** Command name for fetching resource (e.g., "get_pod", "get_deployment") */
  getCommand: string;
  /** Command name for fetching YAML (e.g., "get_pod_yaml", "get_deployment_yaml") */
  yamlCommand: string;
  /** Command name for deleting resource (e.g., "delete_pod", "delete_deployment") */
  deleteCommand?: string;
  /** Optional callback when resource is fetched */
  onResourceFetched?: (resource: T) => void;
  /** Optional callback after successful deletion */
  onDeleted?: () => void;
  /** Enable placeholder data for smoother transitions */
  placeholderData?: boolean;
  /** Default tab to show */
  defaultTab?: string;
}

export interface UseResourceDetailResult<T> {
  // Route params
  name: string | undefined;
  namespace: string | undefined;
  
  // Resource data
  resource: T | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
  
  // YAML data
  yaml: string | undefined;
  isLoadingYaml: boolean;
  copyYaml: () => void;
  
  // Tab management
  activeTab: string;
  setActiveTab: (tab: string) => void;
  
  // Navigation
  goBack: () => void;
  navigate: ReturnType<typeof useNavigate>;
  
  // Delete mutation
  deleteMutation: ReturnType<typeof useMutation<void, Error, void>> | null;
  
  // Toast
  toast: ReturnType<typeof useToast>["toast"];
  
  // Clipboard
  copyToClipboard: ReturnType<typeof useCopyToClipboard>;
}

/**
 * Hook for resource detail pages with common functionality
 */
export function useResourceDetail<T>(
  options: UseResourceDetailOptions<T>
): UseResourceDetailResult<T> {
  const {
    resourceKind,
    getCommand,
    yamlCommand,
    deleteCommand,
    onResourceFetched,
    onDeleted,
    placeholderData = true,
    defaultTab = "overview",
  } = options;

  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const copyToClipboard = useCopyToClipboard();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Fetch resource data
  const {
    data: resource,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: [resourceKind.toLowerCase(), namespace, name],
    queryFn: async () => {
      const result = await invoke<T>(getCommand, { name, namespace });
      onResourceFetched?.(result);
      return result;
    },
    enabled: !!namespace && !!name,
    placeholderData: placeholderData ? keepPreviousData : undefined,
  });

  // Fetch YAML (only when YAML tab is active)
  const { data: yaml, isLoading: isLoadingYaml } = useQuery({
    queryKey: [`${resourceKind.toLowerCase()}-yaml`, namespace, name],
    queryFn: () => invoke<string>(yamlCommand, { name, namespace }),
    enabled: activeTab === "yaml" && !!namespace && !!name,
  });

  // Copy YAML to clipboard
  const copyYaml = useCallback(() => {
    if (yaml) {
      copyToClipboard(yaml, "YAML copied to clipboard.");
    }
  }, [yaml, copyToClipboard]);

  // Go back navigation
  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Delete mutation
  const deleteMutation = deleteCommand
    ? useMutation({
        mutationFn: async () => {
          await invoke(deleteCommand, { name, namespace });
        },
        onSuccess: () => {
          toast({
            title: `${resourceKind} deleted`,
            description: `${resourceKind} ${name} has been deleted.`,
          });
          queryClient.invalidateQueries({ queryKey: [resourceKind.toLowerCase()] });
          onDeleted?.() ?? goBack();
        },
        onError: (err) => {
          toast({
            title: "Error",
            description: `Failed to delete ${resourceKind.toLowerCase()}: ${err}`,
            variant: "destructive",
          });
        },
      })
    : null;

  return {
    name,
    namespace,
    resource,
    isLoading,
    isFetching,
    error: error as Error | null,
    refetch,
    yaml,
    isLoadingYaml,
    copyYaml,
    activeTab,
    setActiveTab,
    goBack,
    navigate,
    deleteMutation,
    toast,
    copyToClipboard,
  };
}

/**
 * Loading skeleton component props
 */
export interface DetailLoadingProps {
  /** Number of skeleton items */
  count?: number;
}

/**
 * Error state component props
 */
export interface DetailErrorProps {
  /** Error message */
  message?: string;
  /** Resource kind for display */
  resourceKind?: string;
  /** Whether resource was not found */
  isNotFound?: boolean;
  /** Go back callback */
  onBack?: () => void;
  /** Additional actions */
  actions?: React.ReactNode;
}

/**
 * Check if error indicates resource not found
 */
export function isResourceNotFoundError(error: Error | null | string): boolean {
  if (!error) return false;
  const errorStr = String(error);
  return errorStr.includes("not found") || errorStr.includes("NotFound");
}

