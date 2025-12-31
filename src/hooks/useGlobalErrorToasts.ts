import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useDeduplicatedToast } from "./useDeduplicatedToast";
import { isLicenseError } from "@/lib/license-error-utils";
import { normalizeTauriError } from "@/lib/error-utils";
import { logError } from "@/lib/logger";

export function useGlobalErrorToasts() {
  const { emitToast } = useDeduplicatedToast();

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const description =
        event.error?.message || event.message || "Unknown error";
      logError("Window error", {
        context: "window.error",
        data: event.error ?? event.message,
      });
      emitToast("Unexpected error", description);
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const description = normalizeTauriError(event.reason);
      logError("Unhandled rejection", {
        context: "window.unhandledrejection",
        data: event.reason,
      });
      // Check if it's a license-related error
      if (isLicenseError(description)) {
        emitToast("Premium Feature", description);
      } else {
        emitToast("Unhandled promise rejection", description);
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    let unlisten: null | (() => void) = null;
    listen<{ code?: string; message?: string }>("app-error", (event) => {
      const code = event.payload.code ? ` (${event.payload.code})` : "";
      const description = event.payload.message || "Unknown backend error";
      logError("Backend error", {
        context: "tauri.app-error",
        data: event.payload,
      });
      emitToast(`Backend error${code}`, description);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      if (unlisten) {
        unlisten();
      }
    };
  }, [emitToast]);
}
