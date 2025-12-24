import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLicense } from "@/hooks/useLicense";
import { LicenseInfoDialog } from "./LicenseInfoDialog";
import { useState } from "react";
import { Crown, Clock, XCircle, CheckCircle2 } from "lucide-react";

export function LicenseStatusBadge() {
  const { licenseStatus, hasValidLicense } = useLicense();
  const [showInfoDialog, setShowInfoDialog] = useState(false);

  if (!licenseStatus) {
    return (
      <Badge variant="outline" className="cursor-pointer">
        Free
      </Badge>
    );
  }

  const getBadgeVariant = () => {
    if (hasValidLicense) {
      // Issue #16 Fix: Check if expiring soon (within 7 days)
      if (licenseStatus.subscription_type === "monthly" && licenseStatus.expires_at) {
        const expiresAt = new Date(licenseStatus.expires_at);
        const daysUntilExpiry = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
          return "secondary"; // Warning variant for expiring soon
        }
      }
      return "default";
    }
    if (licenseStatus.has_license) {
      return "destructive"; // Expired
    }
    return "outline"; // No license
  };

  const getBadgeContent = () => {
    if (hasValidLicense) {
      // Issue #16 Fix: Show expiration warning for monthly licenses expiring soon
      if (licenseStatus.subscription_type === "monthly" && licenseStatus.expires_at) {
        const expiresAt = new Date(licenseStatus.expires_at);
        const daysUntilExpiry = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
          return (
            <>
              <Clock className="h-3 w-3 mr-1" />
              Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}
            </>
          );
        }
      }
      
      if (licenseStatus.subscription_type === "infinite") {
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
    if (licenseStatus.has_license) {
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

