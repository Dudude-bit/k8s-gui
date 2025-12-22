import { useMutation, useMutationOptions, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";

export interface UseResourceMutationOptions<TData, TVariables, TError = Error> {
  /** Success toast title */
  successTitle: string;
  /** Success toast description (can be a function that receives the data) */
  successDescription?: string | ((data: TData) => string);
  /** Error message prefix */
  errorPrefix: string;
  /** Query keys to invalidate on success */
  invalidateQueryKey?: string[];
  /** Additional onSuccess callback */
  onSuccess?: (data: TData, variables: TVariables) => void;
  /** Additional onError callback */
  onError?: (error: TError, variables: TVariables) => void;
}

/**
 * Hook for resource mutations with standardized toast notifications and query invalidation
 */
export function useResourceMutation<TData = unknown, TVariables = void, TError = Error>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: UseResourceMutationOptions<TData, TVariables, TError>
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation<TData, TError, TVariables>({
    mutationFn,
    onSuccess: (data, variables) => {
      if (options.invalidateQueryKey) {
        queryClient.invalidateQueries({ queryKey: options.invalidateQueryKey });
      }
      toast({
        title: options.successTitle,
        description:
          typeof options.successDescription === "function"
            ? options.successDescription(data)
            : options.successDescription,
      });
      options.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: "Error",
        description: `${options.errorPrefix}: ${errorMessage}`,
        variant: "destructive",
      });
      options.onError?.(error, variables);
    },
  } as useMutationOptions<TData, TError, TVariables>);
}

