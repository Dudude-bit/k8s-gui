import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLicense } from "@/hooks/useLicense";
import { LicenseInfoDialog } from "./LicenseInfoDialog";
import { useState } from "react";
import { Crown, Clock, XCircle, CheckCircle2 } from "lucide-react";
import { AUTH_DISABLED } from "@/lib/flags";
import { useRealtimeCountdown } from "@/hooks/useRealtimeAge";

export function LicenseStatusBadge() {
  const { licenseStatus, hasValidLicense } = useLicense();
  const [showInfoDialog, setShowInfoDialog] = useState(false);

  // Real-time countdown for license expiry
  const { remainingSeconds, warningLevel } = useRealtimeCountdown(
    licenseStatus?.expiresAt ?? null,
    { warningThresholdDays: 7, criticalThresholdDays: 1 }
  );

  if (AUTH_DISABLED) {
    return null;
  }

  if (!licenseStatus) {
    return (
      <Badge variant="outline" className="cursor-pointer">
        Free
      </Badge>
    );
  }

  const daysUntilExpiry = Math.ceil(remainingSeconds / 86400);

  const getBadgeVariant = () => {
    if (hasValidLicense) {
      // Issue #16 Fix: Check if expiring soon (within 7 days)
      if (
        licenseStatus.subscriptionType === "monthly" &&
        licenseStatus.expiresAt
      ) {
        if (warningLevel !== "none" && daysUntilExpiry > 0) {
          return "secondary"; // Warning variant for expiring soon
        }
      }
      return "default";
    }
    if (licenseStatus.hasLicense) {
      return "destructive"; // Expired
    }
    return "outline"; // No license
  };

  const getBadgeContent = () => {
    if (hasValidLicense) {
      // Issue #16 Fix: Show expiration warning for monthly licenses expiring soon
      if (
        licenseStatus.subscriptionType === "monthly" &&
        licenseStatus.expiresAt
      ) {
        if (warningLevel !== "none" && daysUntilExpiry > 0) {
          return (
            <>
              <Clock className="h-3 w-3 mr-1" />
              Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? "s" : ""}
            </>
          );
        }
      }

      if (licenseStatus.subscriptionType === "lifetime") {
        return (
          <>
            <Crown className="h-3 w-3 mr-1" />
            Premium
          </>
        );
      }
      return (
        <>
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Premium
        </>
      );
    }
    if (licenseStatus.hasLicense) {
      return (
        <>
          <Clock className="h-3 w-3 mr-1" />
          Expired
        </>
      );
    }
    return (
      <>
        <XCircle className="h-3 w-3 mr-1" />
        Free
      </>
    );
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-auto p-1"
        onClick={() => setShowInfoDialog(true)}
      >
        <Badge variant={getBadgeVariant()} className="cursor-pointer">
          {getBadgeContent()}
        </Badge>
      </Button>

      <LicenseInfoDialog
        open={showInfoDialog}
        onOpenChange={setShowInfoDialog}
      />
    </>
  );
}
