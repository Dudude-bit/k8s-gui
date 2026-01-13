import { useThemeStore } from "@/stores/themeStore";
import { useUpdaterStore } from "@/stores/updaterStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { commands } from "@/lib/commands";
import { useToast } from "@/components/ui/use-toast";
import { PortForwardManager } from "@/components/port-forward/PortForwardManager";
import { RegistrySettings } from "@/components/registry/RegistrySettings";
import { CloudProfiles } from "@/components/settings/CloudProfiles";
import { CliSettings } from "@/components/settings/CliSettings";
import { LicenseSection } from "@/components/profile/LicenseSection";
import { PremiumFeatureGuard } from "@/components/license/PremiumFeatureGuard";
import { Link } from "react-router-dom";
import { User, Download, RefreshCw, AlertCircle } from "lucide-react";
import { normalizeTauriError } from "@/lib/error-utils";

export function Settings() {
  const { theme, setTheme } = useThemeStore();
  const { toast } = useToast();
  const {
    available: updateAvailable,
    version: updateVersion,
    checking: updateChecking,
    downloading: updateDownloading,
    progress: updateProgress,
    error: updateError,
    autoCheckEnabled,
    setAutoCheckEnabled,
    checkForUpdates,
    downloadAndInstall,
  } = useUpdaterStore();

  const { data: appInfo } = useQuery({
    queryKey: ["appInfo"],
    queryFn: commands.getAppInfo,
    staleTime: Infinity,
  });

  const clearCacheMutation = useMutation({
    mutationFn: async () => {
      try {
        await commands.clearCache();
      } catch (err) {
        throw normalizeTauriError(err);
      }
    },
    onSuccess: () => {
      toast({
        title: "Cache cleared",
        description: "All cached data has been removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: normalizeTauriError(error),
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Customize your K8s GUI experience
        </p>
      </div>

      {/* Account & License Section */}
      <Card>
        <CardHeader>
          <CardTitle>Account & License</CardTitle>
          <CardDescription>
            Manage your account and license information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">User Profile</p>
              <p className="text-sm text-muted-foreground">
                View and edit your profile information
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/profile">
                <User className="mr-2 h-4 w-4" />
                Go to Profile
              </Link>
            </Button>
          </div>
          <Separator />
          <LicenseSection />
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize the look and feel of the application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Theme</Label>
            <RadioGroup
              value={theme}
              onValueChange={(value) =>
                setTheme(value as "light" | "dark" | "system")
              }
              className="grid grid-cols-3 gap-4"
            >
              <div>
                <RadioGroupItem
                  value="light"
                  id="light"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="light"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <span className="mb-2 text-2xl">☀️</span>
                  Light
                </Label>
              </div>
              <div>
                <RadioGroupItem
                  value="dark"
                  id="dark"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="dark"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <span className="mb-2 text-2xl">🌙</span>
                  Dark
                </Label>
              </div>
              <div>
                <RadioGroupItem
                  value="system"
                  id="system"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="system"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <span className="mb-2 text-2xl">💻</span>
                  System
                </Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* Cache */}
      <Card>
        <CardHeader>
          <CardTitle>Cache</CardTitle>
          <CardDescription>
            Manage cached data for better performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Clear Cache</p>
              <p className="text-sm text-muted-foreground">
                Remove all cached resource data
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => clearCacheMutation.mutate()}
              disabled={clearCacheMutation.isPending}
            >
              {clearCacheMutation.isPending ? "Clearing..." : "Clear Cache"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cloud Profiles */}
      <CloudProfiles />

      {/* CLI Tools */}
      <CliSettings />

      <RegistrySettings />

      <PremiumFeatureGuard featureName="Port forwarding">
        <PortForwardManager />
      </PremiumFeatureGuard>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
          <CardDescription>Application information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span className="font-mono">{appInfo?.version ?? "..."}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tauri</span>
            <span>{appInfo?.tauriVersion ?? "..."}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Framework</span>
            <span>React + TypeScript</span>
          </div>
          <Separator />

          {/* Update Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Updates</p>
                {updateAvailable && updateVersion && (
                  <p className="text-sm text-muted-foreground">
                    Version {updateVersion} available
                  </p>
                )}
                {updateError && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {updateError}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {!updateAvailable && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const update = await checkForUpdates();
                      if (update) {
                        toast({
                          title: "Update available",
                          description: `Version ${update.version} is ready to download`,
                        });
                      } else if (!updateError) {
                        toast({
                          title: "No updates",
                          description: "You're running the latest version",
                        });
                      }
                    }}
                    disabled={updateChecking}
                  >
                    {updateChecking ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Check for Updates
                      </>
                    )}
                  </Button>
                )}
                {updateAvailable && !updateDownloading && (
                  <Button
                    size="sm"
                    onClick={() => {
                      toast({
                        title: "Downloading update",
                        description: "The app will restart automatically when ready",
                      });
                      downloadAndInstall();
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download & Install
                  </Button>
                )}
              </div>
            </div>

            {updateDownloading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Downloading...</span>
                  <span className="font-mono">{updateProgress}%</span>
                </div>
                <Progress value={updateProgress} className="h-2" />
              </div>
            )}

            <Separator />

            {/* Auto-check toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Automatic Updates</p>
                <p className="text-sm text-muted-foreground">
                  Check for updates on startup and every 30 minutes
                </p>
              </div>
              <Switch
                checked={autoCheckEnabled}
                onCheckedChange={setAutoCheckEnabled}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
