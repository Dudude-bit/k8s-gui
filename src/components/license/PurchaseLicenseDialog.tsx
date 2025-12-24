import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Crown, Infinity } from "lucide-react";

interface PurchaseLicenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PurchaseLicenseDialog({
  open,
  onOpenChange,
}: PurchaseLicenseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upgrade to Premium</DialogTitle>
          <DialogDescription>
            Unlock all premium features with a subscription
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5" />
                Monthly Subscription
              </CardTitle>
              <CardDescription>
                Perfect for regular use
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-3xl font-bold">$9.99</div>
                <div className="text-sm text-muted-foreground">per month</div>
              </div>
              <ul className="space-y-2 text-sm">
                <li>✓ All premium features</li>
                <li>✓ Automatic updates</li>
                <li>✓ Priority support</li>
                <li>✓ Cancel anytime</li>
              </ul>
              <Button className="w-full" variant="outline">
                Subscribe Monthly
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Infinity className="h-5 w-5" />
                Lifetime License
              </CardTitle>
              <CardDescription>
                One-time payment, lifetime access
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-3xl font-bold">$199</div>
                <div className="text-sm text-muted-foreground">one-time</div>
              </div>
              <ul className="space-y-2 text-sm">
                <li>✓ All premium features</li>
                <li>✓ Lifetime updates</li>
                <li>✓ Priority support</li>
                <li>✓ Best value</li>
              </ul>
              <Button className="w-full">
                Buy Lifetime
              </Button>
            </CardContent>
          </Card>
        </div>
        <div className="text-sm text-muted-foreground text-center mt-4">
          Premium features include: Metrics, Logs, Terminal, Port Forwarding, and more
        </div>
      </DialogContent>
    </Dialog>
  );
}

