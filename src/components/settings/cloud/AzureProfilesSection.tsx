import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, TestTube, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import type { AzureProfile } from "@/generated/types";
import { commands } from "@/lib/commands";
import { normalizeTauriError } from "@/lib/error-utils";

const EMPTY_PROFILE: AzureProfile = {
  description: null,
  azPath: null,
  kubeloginPath: null,
  defaultSubscription: null,
  tenantId: null,
  useCliFallback: false,
  preferNativeAuth: true,
};

export function AzureProfilesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] =
    useState<AzureProfile>(EMPTY_PROFILE);
  const [newProfileName, setNewProfileName] = useState("");

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["azureProfiles"],
    queryFn: commands.listAzureProfiles,
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      name,
      profile,
    }: {
      name: string;
      profile: AzureProfile;
    }) => {
      await commands.saveAzureProfile(name, profile);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["azureProfiles"] });
      setDialogOpen(false);
      toast({ title: "Azure profile saved" });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: normalizeTauriError(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: commands.deleteAzureProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["azureProfiles"] });
      queryClient.invalidateQueries({ queryKey: ["contextBindings"] });
      toast({ title: "Azure profile deleted" });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: normalizeTauriError(error),
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: commands.testAzureProfile,
    onSuccess: (result) => {
      toast({
        title: result.includes("successful") ? "Success" : "Failed",
        description: result,
        variant: result.includes("successful") ? "default" : "destructive",
      });
    },
  });

  const openEditDialog = (name: string, profile: AzureProfile) => {
    setEditingName(name);
    setNewProfileName(name);
    setEditingProfile(profile);
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingName(null);
    setNewProfileName("");
    setEditingProfile(EMPTY_PROFILE);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Azure Profiles</h3>
        <Button size="sm" variant="outline" onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Profile
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : profiles?.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No Azure profiles configured. Using default az login credentials.
        </p>
      ) : (
        <div className="space-y-2">
          {profiles?.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.name}</span>
                  {item.profile.tenantId && (
                    <Badge variant="secondary">
                      Tenant: {item.profile.tenantId.slice(0, 8)}...
                    </Badge>
                  )}
                </div>
                {item.profile.description && (
                  <p className="text-xs text-muted-foreground">
                    {item.profile.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => testMutation.mutate(item.name)}
                  disabled={testMutation.isPending}
                >
                  <TestTube className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openEditDialog(item.name, item.profile)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(item.name)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingName ? "Edit Azure Profile" : "Create Azure Profile"}
            </DialogTitle>
            <DialogDescription>
              Configure authentication settings for AKS clusters
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Profile Name</Label>
              <Input
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="e.g., production, personal"
                disabled={!!editingName}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                value={editingProfile.description || ""}
                onChange={(e) =>
                  setEditingProfile((prev) => ({
                    ...prev,
                    description: e.target.value || null,
                  }))
                }
                placeholder="e.g., Production AKS clusters"
              />
            </div>
            <div className="space-y-2">
              <Label>Tenant ID (optional)</Label>
              <Input
                value={editingProfile.tenantId || ""}
                onChange={(e) =>
                  setEditingProfile((prev) => ({
                    ...prev,
                    tenantId: e.target.value || null,
                  }))
                }
                placeholder="Azure AD Tenant ID"
              />
            </div>
            <div className="space-y-2">
              <Label>Default Subscription (optional)</Label>
              <Input
                value={editingProfile.defaultSubscription || ""}
                onChange={(e) =>
                  setEditingProfile((prev) => ({
                    ...prev,
                    defaultSubscription: e.target.value || null,
                  }))
                }
                placeholder="Azure Subscription ID"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Use CLI Fallback</Label>
              <Switch
                checked={editingProfile.useCliFallback}
                onCheckedChange={(checked) =>
                  setEditingProfile((prev) => ({
                    ...prev,
                    useCliFallback: checked,
                  }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Prefer Native SDK Auth</Label>
              <Switch
                checked={editingProfile.preferNativeAuth}
                onCheckedChange={(checked) =>
                  setEditingProfile((prev) => ({
                    ...prev,
                    preferNativeAuth: checked,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                saveMutation.mutate({
                  name: newProfileName,
                  profile: editingProfile,
                })
              }
              disabled={!newProfileName || saveMutation.isPending}
            >
              {saveMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
