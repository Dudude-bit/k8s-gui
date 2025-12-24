import { ReactNode } from "react";
import { usePremiumFeature } from "@/hooks/usePremiumFeature";
import { LicenseErrorBanner } from "./LicenseErrorBanner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";

interface PremiumFeatureGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  featureName?: string;
}

export function PremiumFeatureGuard({
  children,
  fallback,
  featureName,
}: PremiumFeatureGuardProps) {
  const { hasAccess } = usePremiumFeature();

  if (hasAccess) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Premium Feature
        </CardTitle>
        <CardDescription>
          {featureName
            ? `${featureName} is available for premium users only.`
            : "This feature is available for premium users only."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LicenseErrorBanner />
      </CardContent>
    </Card>
  );
}

