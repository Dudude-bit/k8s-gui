import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2, Plus, TestTube, Trash2 } from "lucide-react";

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
import type { GcpProfile } from "@/generated/types";
import { commands } from "@/lib/commands";
import { normalizeTauriError } from "@/lib/error-utils";

const EMPTY_PROFILE: GcpProfile = {
  description: undefined,
  serviceAccountKeyPath: undefined,
  gcloudPath: undefined,
  defaultProject: undefined,
  preferNativeAuth: true,
};

export function GcpProfilesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] =
    useState<GcpProfile>(EMPTY_PROFILE);
  const [newProfileName, setNewProfileName] = useState("");

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["gcpProfiles"],
    queryFn: commands.listGcpProfiles,
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      name,
      profile,
    }: {
      name: string;
      profile: GcpProfile;
    }) => {
      await commands.saveGcpProfile(name, profile);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gcpProfiles"] });
      setDialogOpen(false);
      toast({ title: "GCP profile saved" });
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
    mutationFn: commands.deleteGcpProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gcpProfiles"] });
      queryClient.invalidateQueries({ queryKey: ["contextBindings"] });
      toast({ title: "GCP profile deleted" });
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
    mutationFn: commands.testGcpProfile,
    onSuccess: (result) => {
      toast({
        title: result.includes("successful") ? "Success" : "Failed",
        description: result,
        variant: result.includes("successful") ? "default" : "destructive",
      });
    },
  });

  const openEditDialog = (name: string, profile: GcpProfile) => {
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

  const handleFilePicker = async (
    field: "serviceAccountKeyPath" | "gcloudPath"
  ) => {
    const selected = await open({
      multiple: false,
      filters:
        field === "serviceAccountKeyPath"
          ? [{ name: "JSON", extensions: ["json"] }]
          : undefined,
    });
    if (selected) {
      setEditingProfile((prev) => ({ ...prev, [field]: selected }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">GCP Profiles</h3>
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
          No GCP profiles configured. Using Application Default Credentials.
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
                  {item.profile.serviceAccountKeyPath && (
                    <Badge variant="secondary">Service Account</Badge>
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
              {editingName ? "Edit GCP Profile" : "Create GCP Profile"}
            </DialogTitle>
            <DialogDescription>
              Configure authentication settings for GKE clusters
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
                    description: e.target.value || undefined,
                  }))
                }
                placeholder="e.g., Production GKE clusters"
              />
            </div>
            <div className="space-y-2">
              <Label>Service Account Key Path (optional)</Label>
              <div className="flex gap-2">
                <Input
                  value={editingProfile.serviceAccountKeyPath || ""}
                  onChange={(e) =>
                    setEditingProfile((prev) => ({
                      ...prev,
                      serviceAccountKeyPath: e.target.value || undefined,
                    }))
                  }
                  placeholder="Leave empty to use ADC"
                />
                <Button
                  variant="outline"
                  onClick={() => handleFilePicker("serviceAccountKeyPath")}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                If not set, uses Application Default Credentials (gcloud auth)
              </p>
            </div>
            <div className="space-y-2">
              <Label>Default Project (optional)</Label>
              <Input
                value={editingProfile.defaultProject || ""}
                onChange={(e) =>
                  setEditingProfile((prev) => ({
                    ...prev,
                    defaultProject: e.target.value || undefined,
                  }))
                }
                placeholder="GCP Project ID"
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
