import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";

export interface UseResourceListDeleteConfig<T extends { name: string; namespace: string }> {
  /** Function to delete a resource */
  mutationFn: (item: T) => Promise<void>;
  /** Query key to invalidate after deletion */
  invalidateQueryKey: string[];
  /** Success message title */
  successTitle: string;
  /** Success message description */
  successDescription: string;
  /** Error message prefix */
  errorPrefix: string;
}

export function useResourceListDelete<T extends { name: string; namespace: string }>(
  config: UseResourceListDeleteConfig<T>,
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (item: T) => {
      await config.mutationFn(item);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: config.invalidateQueryKey });
      toast({
        title: config.successTitle,
        description: config.successDescription,
      });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `${config.errorPrefix}: ${error}`,
        variant: "destructive",
      });
      setDeleteTarget(null);
    },
  });

  return {
    deleteTarget,
    setDeleteTarget,
    deleteMutation,
  };
}

