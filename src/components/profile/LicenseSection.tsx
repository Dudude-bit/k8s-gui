import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLicense } from "@/hooks/useLicense";
import { ActivateLicenseDialog } from "@/components/license/ActivateLicenseDialog";
import { PurchaseLicenseDialog } from "@/components/license/PurchaseLicenseDialog";
import { useState } from "react";
import { Crown, Clock, Infinity, Calendar, XCircle } from "lucide-react";

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export function LicenseSection() {
  const { licenseStatus, hasValidLicense } = useLicense();
  const [showActivate, setShowActivate] = useState(false);
  const [showPurchase, setShowPurchase] = useState(false);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>License Status</CardTitle>
          <CardDescription>
            Your current subscription and license information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {licenseStatus ? (
            <>
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
                    <>
                      <XCircle className="h-3 w-3 mr-1" />
                      Free
                    </>
                  )}
                </Badge>
              </div>

              {licenseStatus.hasLicense && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Subscription Type
                    </span>
                    <div className="flex items-center gap-2">
                      {licenseStatus.subscriptionType === "lifetime" ? (
                        <Infinity className="h-4 w-4" />
                      ) : (
                        <Calendar className="h-4 w-4" />
                      )}
                      <span className="text-sm capitalize">
                        {licenseStatus.subscriptionType || "N/A"}
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
                    <div className="space-y-2">
                      <span className="text-sm font-medium">License Key</span>
                      <code className="block text-xs bg-muted px-3 py-2 rounded font-mono break-all">
                        {licenseStatus.licenseKey}
                      </code>
                    </div>
                  )}
                </>
              )}

              {!hasValidLicense && (
                <div className="pt-4 border-t space-y-2">
                  <Button
                    onClick={() => setShowPurchase(true)}
                    className="w-full"
                  >
                    Purchase License
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowActivate(true)}
                    className="w-full"
                  >
                    Activate License
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 space-y-4">
              <p className="text-sm text-muted-foreground">
                No license information available
              </p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => setShowPurchase(true)}>
                  Purchase License
                </Button>
                <Button variant="outline" onClick={() => setShowActivate(true)}>
                  Activate License
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
