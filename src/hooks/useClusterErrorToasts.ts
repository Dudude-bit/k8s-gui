import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useClusterStore } from "@/stores/clusterStore";

const DEDUPE_MS = 3000;

export function useClusterErrorToasts() {
  const { toast } = useToast();
  const error = useClusterStore((state) => state.error);
  const errorContext = useClusterStore((state) => state.errorContext);
  const lastErrorRef = useRef<{ message: string; time: number } | null>(null);

  useEffect(() => {
    if (!error || !errorContext) {
      return;
    }
    const message = `${errorContext}: ${error}`;
    const now = Date.now();
    if (lastErrorRef.current) {
      const { message: prevMessage, time } = lastErrorRef.current;
      if (prevMessage === message && now - time < DEDUPE_MS) {
        return;
      }
    }
    lastErrorRef.current = { message, time: now };
    toast({
      title: "Cluster connection failed",
      description: message,
      variant: "destructive",
    });
  }, [error, errorContext, toast]);
}
