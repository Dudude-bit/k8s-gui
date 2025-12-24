import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { isLicenseError, createLicenseErrorToast } from "@/lib/license-error-utils";

/**
 * Hook to listen for license-related errors from Tauri commands
 * and show appropriate toast notifications
 */
export function useLicenseErrorToasts() {
  const { toast } = useToast();
  const [showActivateDialog, setShowActivateDialog] = useState(false);

  useEffect(() => {
    // Global error handler for license-related errors
    // Most errors are handled in components, but this provides a fallback
    const handleError = (event: ErrorEvent) => {
      const errorMessage = String(event.message || event.error);
      
      // Check if error is license-related
      if (isLicenseError(errorMessage)) {
        toast(
          createLicenseErrorToast(errorMessage, (
            <ToastAction altText="Activate License" onClick={() => setShowActivateDialog(true)}>
              Activate License
            </ToastAction>
          ))
        );
      }
    };

    window.addEventListener("error", handleError);
    
    return () => {
      window.removeEventListener("error", handleError);
    };
  }, [toast, setShowActivateDialog]);

  // Issue #20 Fix: Removed console.error override
  // Errors are handled at component level and via error boundaries
  // Global console.error override is not recommended as it can interfere with other error handlers

  return { showActivateDialog, setShowActivateDialog };
}

