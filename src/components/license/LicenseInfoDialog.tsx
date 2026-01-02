import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLicense } from "@/hooks/useLicense";
import { ActivateLicenseDialog } from "./ActivateLicenseDialog";
import { PurchaseLicenseDialog } from "./PurchaseLicenseDialog";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Crown, Clock, Infinity, Calendar } from "lucide-react";
// Format date helper
// Issue #12 Fix: Handle null/undefined dates
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "Invalid Date";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Issue #18 Fix: Consistent subscription type display
const getSubscriptionTypeDisplay = (
  type: string | null | undefined
): string => {
  switch (type) {
    case "monthly":
      return "Monthly";
    case "lifetime":
      return "Lifetime";
    default:
      return "N/A";
  }
};

interface LicenseInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LicenseInfoDialog({
  open,
  onOpenChange,
}: LicenseInfoDialogProps) {
  const { licenseStatus, hasValidLicense } = useLicense();
  const [showActivate, setShowActivate] = useState(false);
  const [showPurchase, setShowPurchase] = useState(false);

  if (!licenseStatus) {
    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>License Status</DialogTitle>
              <DialogDescription>
                No license information available
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You are currently using the free version. Upgrade to premium to
                unlock all features.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => setShowPurchase(true)}>
                  Purchase License
                </Button>
                <Button variant="outline" onClick={() => setShowActivate(true)}>
                  Activate License
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <ActivateLicenseDialog
          open={showActivate}
          onOpenChange={setShowActivate}
        />
        <PurchaseLicenseDialog
          open={showPurchase}
          onOpenChange={setShowPurchase}
        />
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>License Information</DialogTitle>
            <DialogDescription>
              Your current license status and details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Badge variant={hasValidLicense ? "default" : "destructive"}>
                {hasValidLicense ? (
                  <>
                    <Crown className="h-3 w-3 mr-1" />
                    Active
                  </>
                ) : licenseStatus.hasLicense ? (
                  <>
                    <Clock className="h-3 w-3 mr-1" />
                    Expired
                  </>
                ) : (
                  "Free"
                )}
              </Badge>
            </div>

            {licenseStatus.hasLicense && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Subscription Type</span>
                  <div className="flex items-center gap-2">
                    {licenseStatus.subscriptionType === "lifetime" ? (
                      <Infinity className="h-4 w-4" />
                    ) : (
                      <Calendar className="h-4 w-4" />
                    )}
                    <span className="text-sm">
                      {getSubscriptionTypeDisplay(
                        licenseStatus.subscriptionType
                      )}
                    </span>
                  </div>
                </div>

                {licenseStatus.expiresAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Expires At</span>
                    <span className="text-sm">
                      {formatDate(licenseStatus.expiresAt)}
                    </span>
                  </div>
                )}

                {licenseStatus.licenseKey && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">License Key</span>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {licenseStatus.licenseKey.substring(0, 8)}...
                    </code>
                  </div>
                )}
              </>
            )}

            {!hasValidLicense && (
              <div className="pt-4 border-t">
                <div className="flex gap-2">
                  <Button
                    onClick={() => setShowPurchase(true)}
                    className="flex-1"
                  >
                    Purchase License
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowActivate(true)}
                    className="flex-1"
                  >
                    Activate License
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ActivateLicenseDialog
        open={showActivate}
        onOpenChange={setShowActivate}
      />
      <PurchaseLicenseDialog
        open={showPurchase}
        onOpenChange={setShowPurchase}
      />
    </>
  );
}
