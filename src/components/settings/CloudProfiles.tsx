import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commands } from "@/lib/commands";
import type { GcpProfile, AzureProfile, ContextBinding } from "@/generated/types";
import { normalizeTauriError } from "@/lib/error-utils";
import {
    ChevronDown,
    ChevronRight,
    Plus,
    Trash2,
    Loader2,
    FolderOpen,
    Cloud,
    Link,
    TestTube,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

// ============================================================================
// Main Component
// ============================================================================

export function CloudProfiles() {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <Card>
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <CardHeader className="pb-3">
                    <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-80 w-full">
                        <div className="flex items-center gap-2 flex-1">
                            {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                            <Cloud className="h-5 w-5" />
                            <CardTitle className="text-lg">Cloud Profiles</CardTitle>
                        </div>
                    </CollapsibleTrigger>
                    <CardDescription className="ml-11">
                        Manage GCP and Azure authentication profiles, and bind them to kubeconfig contexts
                    </CardDescription>
                </CardHeader>
                <CollapsibleContent>
                    <CardContent>
                        <Tabs defaultValue="profiles" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="profiles">
                                    <Cloud className="h-4 w-4 mr-2" />
                                    Profiles
                                </TabsTrigger>
                                <TabsTrigger value="bindings">
                                    <Link className="h-4 w-4 mr-2" />
                                    Context Bindings
                                </TabsTrigger>
                            </TabsList>
                            <TabsContent value="profiles" className="mt-4">
                                <ProfilesTab />
                            </TabsContent>
                            <TabsContent value="bindings" className="mt-4">
                                <BindingsTab />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}

// ============================================================================
// Profiles Tab
// ============================================================================

function ProfilesTab() {
    return (
        <div className="space-y-6">
            <GcpProfilesSection />
            <Separator />
            <AzureProfilesSection />
        </div>
    );
}

function GcpProfilesSection() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingName, setEditingName] = useState<string | null>(null);
    const [editingProfile, setEditingProfile] = useState<GcpProfile>({
        description: null,
        serviceAccountKeyPath: null,
        gcloudPath: null,
        defaultProject: null,
        preferNativeAuth: true,
    });
    const [newProfileName, setNewProfileName] = useState("");

    const { data: profiles, isLoading } = useQuery({
        queryKey: ["gcpProfiles"],
        queryFn: commands.listGcpProfiles,
    });

    const saveMutation = useMutation({
        mutationFn: async ({ name, profile }: { name: string; profile: GcpProfile }) => {
            await commands.saveGcpProfile(name, profile);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["gcpProfiles"] });
            setDialogOpen(false);
            toast({ title: "GCP profile saved" });
        },
        onError: (error) => {
            toast({ title: "Error", description: normalizeTauriError(error), variant: "destructive" });
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
            toast({ title: "Error", description: normalizeTauriError(error), variant: "destructive" });
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
        setEditingProfile({
            description: null,
            serviceAccountKeyPath: null,
            gcloudPath: null,
            defaultProject: null,
            preferNativeAuth: true,
        });
        setDialogOpen(true);
    };

    const handleFilePicker = async (field: "serviceAccountKeyPath" | "gcloudPath") => {
        const selected = await open({
            multiple: false,
            filters: field === "serviceAccountKeyPath" 
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
                                        description: e.target.value || null,
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
                                            serviceAccountKeyPath: e.target.value || null,
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
                                        defaultProject: e.target.value || null,
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

function AzureProfilesSection() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingName, setEditingName] = useState<string | null>(null);
    const [editingProfile, setEditingProfile] = useState<AzureProfile>({
        description: null,
        azPath: null,
        kubeloginPath: null,
        defaultSubscription: null,
        tenantId: null,
        useCliFallback: false,
        preferNativeAuth: true,
    });
    const [newProfileName, setNewProfileName] = useState("");

    const { data: profiles, isLoading } = useQuery({
        queryKey: ["azureProfiles"],
        queryFn: commands.listAzureProfiles,
    });

    const saveMutation = useMutation({
        mutationFn: async ({ name, profile }: { name: string; profile: AzureProfile }) => {
            await commands.saveAzureProfile(name, profile);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["azureProfiles"] });
            setDialogOpen(false);
            toast({ title: "Azure profile saved" });
        },
        onError: (error) => {
            toast({ title: "Error", description: normalizeTauriError(error), variant: "destructive" });
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
            toast({ title: "Error", description: normalizeTauriError(error), variant: "destructive" });
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
        setEditingProfile({
            description: null,
            azPath: null,
            kubeloginPath: null,
            defaultSubscription: null,
            tenantId: null,
            useCliFallback: false,
            preferNativeAuth: true,
        });
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
                                        <Badge variant="secondary">Tenant: {item.profile.tenantId.slice(0, 8)}...</Badge>
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

// ============================================================================
// Bindings Tab
// ============================================================================

function BindingsTab() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedContext, setSelectedContext] = useState<string>("");
    const [editingBinding, setEditingBinding] = useState<ContextBinding>({
        gcpProfile: null,
        azureProfile: null,
    });

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
        mutationFn: async ({ context, binding }: { context: string; binding: ContextBinding }) => {
            await commands.saveContextBinding(context, binding);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["contextBindings"] });
            setDialogOpen(false);
            toast({ title: "Context binding saved" });
        },
        onError: (error) => {
            toast({ title: "Error", description: normalizeTauriError(error), variant: "destructive" });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: commands.deleteContextBinding,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["contextBindings"] });
            toast({ title: "Context binding removed" });
        },
        onError: (error) => {
            toast({ title: "Error", description: normalizeTauriError(error), variant: "destructive" });
        },
    });

    const openEditDialog = async (contextName: string) => {
        setSelectedContext(contextName);
        try {
            const existing = await commands.getContextBinding(contextName);
            setEditingBinding(existing);
        } catch {
            setEditingBinding({ gcpProfile: null, azureProfile: null });
        }
        setDialogOpen(true);
    };

    // Contexts without bindings
    const unboundContexts = contexts?.filter(
        (ctx) => !bindings?.some((b) => b.contextName === ctx.name)
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Context → Profile Bindings</h3>
            </div>

            <p className="text-sm text-muted-foreground">
                Bind cloud authentication profiles to kubeconfig contexts. 
                Contexts without bindings will use Application Default Credentials.
            </p>

            {isLoading ? (
                <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Existing bindings */}
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
                                                <Badge variant="outline">Azure: {item.azureProfile}</Badge>
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

                    {/* Unbound contexts */}
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
                                    <SelectItem value="__none__">Use default (az login)</SelectItem>
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
