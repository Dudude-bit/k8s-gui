import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useState } from "react";
import { ActivateLicenseDialog } from "./ActivateLicenseDialog";

interface LicenseErrorBannerProps {
  message?: string;
  onActivate?: () => void;
}

export function LicenseErrorBanner({
  message,
  onActivate,
}: LicenseErrorBannerProps) {
  const [showActivateDialog, setShowActivateDialog] = useState(false);

  const defaultMessage =
    "This feature requires a premium license. Please activate your license to continue.";

  return (
    <>
      <Alert variant="destructive" className="mb-4">
        <Lock className="h-4 w-4" />
        <AlertTitle>Premium Feature</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>{message || defaultMessage}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowActivateDialog(true);
              onActivate?.();
            }}
            className="ml-4"
          >
            Activate License
          </Button>
        </AlertDescription>
      </Alert>

      <ActivateLicenseDialog
        open={showActivateDialog}
        onOpenChange={setShowActivateDialog}
      />
    </>
  );
}
