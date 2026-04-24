import { useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";

/**
 * Hook for copying text to clipboard with toast notification
 *
 * @returns A callback function that copies text to clipboard and shows a toast notification
 * @example
 * ```tsx
 * const copyToClipboard = useCopyToClipboard();
 * copyToClipboard("Hello World", "Text copied!");
 * ```
 */
export function useCopyToClipboard() {
  const { toast } = useToast();

  return useCallback(
    async (text: string, successMessage = "Copied to clipboard") => {
      try {
        await navigator.clipboard.writeText(text);
        toast({
          title: "Copied",
          description: successMessage,
        });
      } catch (error) {
        toast({
          title: "Error",
          description: `Failed to copy: ${error}`,
          variant: "destructive",
        });
      }
    },
    [toast]
  );
}
