import { useEffect } from "react";
import { useClusterStore } from "@/stores/clusterStore";
import { useDeduplicatedToast } from "./useDeduplicatedToast";

export function useClusterErrorToasts() {
  const { emitToast } = useDeduplicatedToast();
  const error = useClusterStore((state) => state.error);
  const errorContext = useClusterStore((state) => state.errorContext);

  useEffect(() => {
    if (!error || !errorContext) {
      return;
    }
    emitToast("Cluster connection failed", `${errorContext}: ${error}`);
  }, [error, errorContext, emitToast]);
}
