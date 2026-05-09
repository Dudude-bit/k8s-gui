import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { ContextBinding } from "@/generated/types";
import { commands } from "@/lib/commands";
import { normalizeTauriError } from "@/lib/error-utils";

const EMPTY_BINDING: ContextBinding = {
  gcpProfile: null,
  azureProfile: null,
};

export function BindingsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedContext, setSelectedContext] = useState<string>("");
  const [editingBinding, setEditingBinding] =
    useState<ContextBinding>(EMPTY_BINDING);

  const { data: contexts } = useQuery({
    queryKey: ["contexts"],
    queryFn: commands.listContexts,
  });

  const { data: bindings, isLoading } = useQuery({
    queryKey: ["contextBindings"],
    queryFn: commands.listContextBindings,
  });

  const { data: gcpProfiles } = useQuery({
    queryKey: ["gcpProfiles"],
    queryFn: commands.listGcpProfiles,
  });

  const { data: azureProfiles } = useQuery({
    queryKey: ["azureProfiles"],
    queryFn: commands.listAzureProfiles,
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      context,
      binding,
    }: {
      context: string;
      binding: ContextBinding;
    }) => {
      await commands.saveContextBinding(context, binding);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contextBindings"] });
      setDialogOpen(false);
      toast({ title: "Context binding saved" });
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
    mutationFn: commands.deleteContextBinding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contextBindings"] });
      toast({ title: "Context binding removed" });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: normalizeTauriError(error),
        variant: "destructive",
      });
    },
  });

  const openEditDialog = async (contextName: string) => {
    setSelectedContext(contextName);
    try {
      const existing = await commands.getContextBinding(contextName);
      setEditingBinding(existing);
    } catch {
      setEditingBinding(EMPTY_BINDING);
    }
    setDialogOpen(true);
  };

  const unboundContexts = contexts?.filter(
    (ctx) => !bindings?.some((b) => b.contextName === ctx.name)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Context → Profile Bindings</h3>
      </div>

      <p className="text-sm text-muted-foreground">
        Bind cloud authentication profiles to kubeconfig contexts. Contexts
        without bindings will use Application Default Credentials.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {bindings && bindings.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">
                Configured Bindings
              </h4>
              {bindings.map((item) => (
                <div
                  key={item.contextName}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="space-y-1">
                    <span className="font-medium font-mono text-sm">
                      {item.contextName}
                    </span>
                    <div className="flex gap-2">
                      {item.gcpProfile && (
                        <Badge variant="outline">GCP: {item.gcpProfile}</Badge>
                      )}
                      {item.azureProfile && (
                        <Badge variant="outline">
                          Azure: {item.azureProfile}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditDialog(item.contextName)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(item.contextName)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {unboundContexts && unboundContexts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">
                Available Contexts (using defaults)
              </h4>
              {unboundContexts.map((ctx) => (
                <div
                  key={ctx.name}
                  className="flex items-center justify-between p-3 border rounded-lg border-dashed"
                >
                  <span className="font-mono text-sm text-muted-foreground">
                    {ctx.name}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditDialog(ctx.name)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Bind Profile
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Context Binding</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{selectedContext}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>GCP Profile</Label>
              <Select
                value={editingBinding.gcpProfile || "__none__"}
                onValueChange={(value) =>
                  setEditingBinding((prev) => ({
                    ...prev,
                    gcpProfile: value === "__none__" ? null : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Use default (ADC)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Use default (ADC)</SelectItem>
                  {gcpProfiles?.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Azure Profile</Label>
              <Select
                value={editingBinding.azureProfile || "__none__"}
                onValueChange={(value) =>
                  setEditingBinding((prev) => ({
                    ...prev,
                    azureProfile: value === "__none__" ? null : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Use default (az login)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    Use default (az login)
                  </SelectItem>
                  {azureProfiles?.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                saveMutation.mutate({
                  context: selectedContext,
                  binding: editingBinding,
                })
              }
              disabled={saveMutation.isPending}
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
