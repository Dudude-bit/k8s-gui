import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as commands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";
import { Cloud, FolderOpen, TestTube, Loader2, CheckCircle, XCircle } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

interface CloudConfig {
  gcp: {
    serviceAccountKeyPath: string | null;
    gcloudPath: string | null;
    defaultProject: string | null;
    preferNativeAuth: boolean;
  };
  azure: {
    azPath: string | null;
    kubeloginPath: string | null;
    defaultSubscription: string | null;
    tenantId: string | null;
    useCliFallback: boolean;
    preferNativeAuth: boolean;
  };
}

export function CloudProviderSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [config, setConfig] = useState<CloudConfig>({
    gcp: {
      serviceAccountKeyPath: null,
      gcloudPath: null,
      defaultProject: null,
      preferNativeAuth: true,
    },
    azure: {
      azPath: null,
      kubeloginPath: null,
      defaultSubscription: null,
      tenantId: null,
      useCliFallback: false,
      preferNativeAuth: true,
    },
  });

  const [gcpTestResult, setGcpTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [azureTestResult, setAzureTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load current config
  const { data: savedConfig, isLoading } = useQuery({
    queryKey: ["cloudConfig"],
    queryFn: async () => {
      try {
        return await commands.getCloudConfig();
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
  });

  // Update local state when saved config loads
  useEffect(() => {
    if (savedConfig) {
      setConfig(savedConfig);
    }
  }, [savedConfig]);

  // Save config mutation
  const saveMutation = useMutation({
    mutationFn: async (newConfig: CloudConfig) => {
      try {
        await commands.saveCloudConfig(newConfig);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cloudConfig"] });
      toast({
        title: "Settings saved",
        description: "Cloud provider settings have been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error saving settings",
        description: String(error),
        variant: "destructive",
      });
    },
  });

  // Test GCP auth mutation
  const testGcpMutation = useMutation({
    mutationFn: async () => {
      try {
        return await commands.testGcpAuth();
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    onSuccess: (result) => {
      const success = result.toLowerCase().includes("successful");
      setGcpTestResult({ success, message: result });
    },
    onError: (error) => {
      setGcpTestResult({ success: false, message: String(error) });
    },
  });

  // Test Azure auth mutation
  const testAzureMutation = useMutation({
    mutationFn: async () => {
      try {
        return await commands.testAzureAuth();
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    onSuccess: (result) => {
      const success = result.toLowerCase().includes("successful");
      setAzureTestResult({ success, message: result });
    },
    onError: (error) => {
      setAzureTestResult({ success: false, message: String(error) });
    },
  });

  const handleFilePicker = async (field: "serviceAccountKeyPath" | "gcloudPath" | "azPath" | "kubeloginPath") => {
    const isDirectory = false;
    const filters = field === "serviceAccountKeyPath" 
      ? [{ name: "JSON", extensions: ["json"] }]
      : undefined;

    const selected = await open({
      multiple: false,
      directory: isDirectory,
      filters,
    });

    if (selected && typeof selected === "string") {
      if (field === "serviceAccountKeyPath" || field === "gcloudPath") {
        setConfig(prev => ({
          ...prev,
          gcp: { ...prev.gcp, [field]: selected },
        }));
      } else {
        setConfig(prev => ({
          ...prev,
          azure: { ...prev.azure, [field]: selected },
        }));
      }
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          Cloud Provider Authentication
        </CardTitle>
        <CardDescription>
          Configure native SDK authentication for GCP (GKE) and Azure (AKS) clusters.
          Native authentication is more reliable than CLI-based exec plugins.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* GCP Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Google Cloud (GKE)</h3>
            <Badge variant="outline">GCP</Badge>
          </div>
          
          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Use Native SDK Authentication</Label>
                <p className="text-sm text-muted-foreground">
                  Authenticate using Application Default Credentials instead of gcloud CLI
                </p>
              </div>
              <Switch
                checked={config.gcp.preferNativeAuth}
                onCheckedChange={(checked) =>
                  setConfig(prev => ({
                    ...prev,
                    gcp: { ...prev.gcp, preferNativeAuth: checked },
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gcpServiceAccount">Service Account Key (Optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="gcpServiceAccount"
                  placeholder="/path/to/service-account.json"
                  value={config.gcp.serviceAccountKeyPath || ""}
                  onChange={(e) =>
                    setConfig(prev => ({
                      ...prev,
                      gcp: { ...prev.gcp, serviceAccountKeyPath: e.target.value || null },
                    }))
                  }
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleFilePicker("serviceAccountKeyPath")}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty to use Application Default Credentials (gcloud auth application-default login)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gcloudPath">gcloud CLI Path (Fallback)</Label>
              <div className="flex gap-2">
                <Input
                  id="gcloudPath"
                  placeholder="/opt/homebrew/bin/gcloud"
                  value={config.gcp.gcloudPath || ""}
                  onChange={(e) =>
                    setConfig(prev => ({
                      ...prev,
                      gcp: { ...prev.gcp, gcloudPath: e.target.value || null },
                    }))
                  }
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleFilePicker("gcloudPath")}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Custom path to gcloud binary if not in PATH
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gcpProject">Default Project ID</Label>
              <Input
                id="gcpProject"
                placeholder="my-gcp-project"
                value={config.gcp.defaultProject || ""}
                onChange={(e) =>
                  setConfig(prev => ({
                    ...prev,
                    gcp: { ...prev.gcp, defaultProject: e.target.value || null },
                  }))
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setGcpTestResult(null);
                  testGcpMutation.mutate();
                }}
                disabled={testGcpMutation.isPending}
              >
                {testGcpMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <TestTube className="mr-2 h-4 w-4" />
                )}
                Test GCP Authentication
              </Button>
              {gcpTestResult && (
                <div className="flex items-center gap-1 text-sm">
                  {gcpTestResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className={gcpTestResult.success ? "text-green-500" : "text-destructive"}>
                    {gcpTestResult.success ? "Success" : "Failed"}
                  </span>
                </div>
              )}
            </div>
            {gcpTestResult && !gcpTestResult.success && (
              <p className="text-sm text-destructive">{gcpTestResult.message}</p>
            )}
          </div>
        </div>

        <Separator />

        {/* Azure Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Microsoft Azure (AKS)</h3>
            <Badge variant="outline">Azure</Badge>
          </div>
          
          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Use Native SDK Authentication</Label>
                <p className="text-sm text-muted-foreground">
                  Authenticate using Azure SDK instead of kubelogin CLI
                </p>
              </div>
              <Switch
                checked={config.azure.preferNativeAuth}
                onCheckedChange={(checked) =>
                  setConfig(prev => ({
                    ...prev,
                    azure: { ...prev.azure, preferNativeAuth: checked },
                  }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Azure CLI Fallback</Label>
                <p className="text-sm text-muted-foreground">
                  Try Azure CLI credentials if SDK authentication fails
                </p>
              </div>
              <Switch
                checked={config.azure.useCliFallback}
                onCheckedChange={(checked) =>
                  setConfig(prev => ({
                    ...prev,
                    azure: { ...prev.azure, useCliFallback: checked },
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="azureTenant">Tenant ID</Label>
              <Input
                id="azureTenant"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={config.azure.tenantId || ""}
                onChange={(e) =>
                  setConfig(prev => ({
                    ...prev,
                    azure: { ...prev.azure, tenantId: e.target.value || null },
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="azureSubscription">Default Subscription ID</Label>
              <Input
                id="azureSubscription"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={config.azure.defaultSubscription || ""}
                onChange={(e) =>
                  setConfig(prev => ({
                    ...prev,
                    azure: { ...prev.azure, defaultSubscription: e.target.value || null },
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kubeloginPath">kubelogin CLI Path (Fallback)</Label>
              <div className="flex gap-2">
                <Input
                  id="kubeloginPath"
                  placeholder="/opt/homebrew/bin/kubelogin"
                  value={config.azure.kubeloginPath || ""}
                  onChange={(e) =>
                    setConfig(prev => ({
                      ...prev,
                      azure: { ...prev.azure, kubeloginPath: e.target.value || null },
                    }))
                  }
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleFilePicker("kubeloginPath")}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAzureTestResult(null);
                  testAzureMutation.mutate();
                }}
                disabled={testAzureMutation.isPending}
              >
                {testAzureMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <TestTube className="mr-2 h-4 w-4" />
                )}
                Test Azure Authentication
              </Button>
              {azureTestResult && (
                <div className="flex items-center gap-1 text-sm">
                  {azureTestResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className={azureTestResult.success ? "text-green-500" : "text-destructive"}>
                    {azureTestResult.success ? "Success" : "Failed"}
                  </span>
                </div>
              )}
            </div>
            {azureTestResult && !azureTestResult.success && (
              <p className="text-sm text-destructive">{azureTestResult.message}</p>
            )}
          </div>
        </div>

        <Separator />

        <div className="flex justify-end">
          <Button
            onClick={() => saveMutation.mutate(config)}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
