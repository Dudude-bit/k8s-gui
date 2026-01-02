import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/components/ui/use-toast";
import { Spinner } from "@/components/ui/spinner";
import { validateLicenseKey } from "@/lib/validation";
import { normalizeTauriError } from "@/lib/error-utils";

interface ActivateLicenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActivateLicenseDialog({
  open,
  onOpenChange,
}: ActivateLicenseDialogProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { activateLicense } = useAuthStore();
  const { toast } = useToast();

  const handleLicenseKeyChange = (value: string) => {
    setLicenseKey(value);
    // Clear validation error when user starts typing
    if (validationError) {
      setValidationError(null);
    }
  };

  const handleActivate = async () => {
    // Backend validation
    const validation = await validateLicenseKey(licenseKey);
    if (!validation.isValid) {
      setValidationError(validation.error ?? "Invalid license key");
      toast({
        title: "Validation Error",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    setIsActivating(true);
    setValidationError(null);
    try {
      await activateLicense(licenseKey.trim());
      toast({
        title: "Success",
        description: "License activated successfully!",
      });
      setLicenseKey("");
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Activation Failed",
        description: normalizeTauriError(error),
        variant: "destructive",
      });
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activate License</DialogTitle>
          <DialogDescription>
            Enter your license key to activate premium features.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="license-key">License Key</Label>
            <Input
              id="license-key"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={licenseKey}
              onChange={(e) => handleLicenseKeyChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isActivating) {
                  handleActivate();
                }
              }}
              className={validationError ? "border-destructive" : ""}
            />
            {validationError && (
              <p className="text-sm text-destructive">{validationError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              License key should be in UUID format (e.g.,
              550e8400-e29b-41d4-a716-446655440000)
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isActivating}
            >
              Cancel
            </Button>
            <Button onClick={handleActivate} disabled={isActivating}>
              {isActivating && (
                <Spinner size="sm" className="mr-2" />
              )}
              Activate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
