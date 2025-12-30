import { useRef } from "react";
import { useToast } from "@/components/ui/use-toast";

const DEDUPE_MS = 3000;

/**
 * Hook for emitting deduplicated toast notifications
 *
 * Prevents showing the same error message multiple times within a short time window (3 seconds).
 *
 * @returns An object with `emitToast` function for showing deduplicated toast notifications
 * @example
 * ```tsx
 * const { emitToast } = useDeduplicatedToast();
 * emitToast("Error", "Something went wrong");
 * ```
 */
export function useDeduplicatedToast() {
  const { toast } = useToast();
  const lastErrorRef = useRef<{ message: string; time: number } | null>(null);

  const emitToast = (
    title: string,
    description?: string,
    variant: "default" | "destructive" = "destructive"
  ) => {
    const message = description || title;
    const now = Date.now();
    if (lastErrorRef.current) {
      const { message: prevMessage, time } = lastErrorRef.current;
      if (prevMessage === message && now - time < DEDUPE_MS) {
        return;
      }
    }
    lastErrorRef.current = { message, time: now };
    toast({ title, description, variant });
  };

  return { emitToast };
}
