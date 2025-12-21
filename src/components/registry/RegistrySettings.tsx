import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  DEFAULT_REGISTRIES,
  RegistryAuth,
  RegistryAuthStatus,
  RegistryConfig,
  RegistryImportEntry,
  RegistryProvider,
  useRegistryStore,
} from "@/stores/registryStore";

export function RegistrySettings() {
  const { toast } = useToast();
  const registries = useRegistryStore((state) => state.registries);
  const selectedRegistryId = useRegistryStore(
    (state) => state.selectedRegistryId,
  );
  const setSelectedRegistryId = useRegistryStore(
    (state) => state.setSelectedRegistryId,
  );
  const addRegistry = useRegistryStore((state) => state.addRegistry);
  const updateRegistry = useRegistryStore((state) => state.updateRegistry);
  const removeRegistry = useRegistryStore((state) => state.removeRegistry);
  const ensureRegistryUrl = useRegistryStore(
    (state) => state.ensureRegistryUrl,
  );

  const [showRegistryEditor, setShowRegistryEditor] = useState(false);
  const [newRegistryLabel, setNewRegistryLabel] = useState("");
  const [newRegistryUrl, setNewRegistryUrl] = useState("");
  const [newRegistryProvider, setNewRegistryProvider] =
    useState<RegistryProvider>("registry-v2");
  const [newRegistryHost, setNewRegistryHost] = useState("");
  const [newRegistryProject, setNewRegistryProject] = useState("");
  const [newRegistryAccountId, setNewRegistryAccountId] = useState("");
  const [newRegistryRegion, setNewRegistryRegion] = useState("");
  const [registryEditorError, setRegistryEditorError] = useState("");
  const [authByRegistry, setAuthByRegistry] = useState<
    Record<string, RegistryAuth>
  >({});
  const [savedAuthByRegistry, setSavedAuthByRegistry] = useState<
    Record<string, RegistryAuthStatus | null>
  >({});
  const [authStatusMessage, setAuthStatusMessage] = useState("");
  const [importing, setImporting] = useState(false);

  const selectedRegistry = useMemo(() => {
    return (
      registries.find((registry) => registry.id === selectedRegistryId) ??
      DEFAULT_REGISTRIES[0]
    );
  }, [registries, selectedRegistryId]);

  const registryAuth = useMemo(
    () => authByRegistry[selectedRegistryId] ?? { authType: "none" },
    [authByRegistry, selectedRegistryId],
  );

  useEffect(() => {
    let cancelled = false;
    setAuthStatusMessage("");
    invoke<RegistryAuthStatus | null>("get_registry_auth_status", {
      registryId: selectedRegistryId,
    })
      .then((status) => {
        if (cancelled) {
          return;
        }
        setSavedAuthByRegistry((prev) => ({
          ...prev,
          [selectedRegistryId]: status,
        }));
        if (status?.hasCredentials) {
          setAuthByRegistry((prev) => {
            if (prev[selectedRegistryId]) {
              return prev;
            }
            return {
              ...prev,
              [selectedRegistryId]: {
                authType: status.authType as RegistryAuth["authType"],
                username: status.username,
              },
            };
          });
        }
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setSavedAuthByRegistry((prev) => ({
          ...prev,
          [selectedRegistryId]: null,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRegistryId]);

  const updateRegistryAuth = (nextAuth: RegistryAuth) => {
    setAuthByRegistry((prev) => ({ ...prev, [selectedRegistryId]: nextAuth }));
  };

  const handleRegistrySave = () => {
    const labelValue = newRegistryLabel.trim();
    if (newRegistryProvider === "docker-hub") {
      setRegistryEditorError("Docker Hub is already available.");
      return;
    }
    if (
      newRegistryProvider === "registry-v2" ||
      newRegistryProvider === "harbor"
    ) {
      const urlValue = newRegistryUrl.trim();
      if (!urlValue) {
        setRegistryEditorError("Registry URL is required.");
        return;
      }
      const baseUrl = ensureRegistryUrl(urlValue);
      const nextRegistry: Omit<RegistryConfig, "id"> = {
        label: labelValue || urlValue,
        provider: newRegistryProvider,
        baseUrl,
      };
      if (newRegistryProvider === "harbor" && newRegistryProject.trim()) {
        nextRegistry.project = newRegistryProject.trim();
      }
      addRegistry(nextRegistry);
      setShowRegistryEditor(false);
      setNewRegistryLabel("");
      setNewRegistryUrl("");
      setNewRegistryProject("");
      setRegistryEditorError("");
      return;
    }
    if (newRegistryProvider === "gcr") {
      const hostValue = newRegistryHost.trim() || "gcr.io";
      addRegistry({
        label: labelValue || hostValue,
        provider: "gcr",
        host: hostValue,
        project: newRegistryProject.trim() || undefined,
      });
      setShowRegistryEditor(false);
      setNewRegistryLabel("");
      setNewRegistryHost("");
      setNewRegistryProject("");
      setRegistryEditorError("");
      return;
    }
    if (newRegistryProvider === "ecr") {
      const accountId = newRegistryAccountId.trim();
      const region = newRegistryRegion.trim();
      if (!accountId || !region) {
        setRegistryEditorError("ECR account ID and region are required.");
        return;
      }
      addRegistry({
        label: labelValue || `${accountId}.dkr.ecr.${region}.amazonaws.com`,
        provider: "ecr",
        accountId,
        region,
      });
      setShowRegistryEditor(false);
      setNewRegistryLabel("");
      setNewRegistryAccountId("");
      setNewRegistryRegion("");
      setRegistryEditorError("");
    }
  };

  const handleRegistryCancel = () => {
    setShowRegistryEditor(false);
    setNewRegistryLabel("");
    setNewRegistryUrl("");
    setNewRegistryHost("");
    setNewRegistryProject("");
    setNewRegistryAccountId("");
    setNewRegistryRegion("");
    setNewRegistryProvider("registry-v2");
    setRegistryEditorError("");
  };

  const handleRegistryOpen = () => {
    setShowRegistryEditor(true);
    setNewRegistryProvider("registry-v2");
    setNewRegistryLabel("");
    setNewRegistryUrl("");
    setNewRegistryHost("");
    setNewRegistryProject("");
    setNewRegistryAccountId("");
    setNewRegistryRegion("");
    setRegistryEditorError("");
  };

  const normalizeHost = (value?: string) => {
    if (!value) {
      return "";
    }
    return value
      .trim()
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      .toLowerCase();
  };

  const handleImportDockerConfig = async () => {
    setImporting(true);
    const previousSelection = selectedRegistryId;
    try {
      const entries = await invoke<RegistryImportEntry[]>(
        "import_docker_config",
      );
      if (!entries.length) {
        toast({
          title: "Docker config import",
          description: "No registries found in the Docker config.",
        });
        return;
      }

      let added = 0;
      let updated = 0;
      let credentialsSaved = 0;
      let credentialsFailed = 0;

      for (const entry of entries) {
        if (!entry.host) {
          continue;
        }
        const host = normalizeHost(entry.host);
        let registryId = "docker-hub";

        if (!entry.isDockerHub) {
          const current = useRegistryStore
            .getState()
            .registries.find(
              (registry) =>
                normalizeHost(registry.baseUrl ?? registry.host) === host,
            );
          if (current) {
            registryId = current.id;
            if (!current.baseUrl && entry.baseUrl) {
              updateRegistry(current.id, { baseUrl: entry.baseUrl });
            }
            updated += 1;
          } else {
            const created = addRegistry({
              label: entry.host,
              provider: "registry-v2",
              baseUrl: entry.baseUrl,
            });
            registryId = created.id;
            added += 1;
          }
        }

        if (entry.auth && entry.auth.authType !== "none") {
          try {
            await invoke("set_registry_credentials", {
              registryId,
              auth: entry.auth,
            });
            setSavedAuthByRegistry((prev) => ({
              ...prev,
              [registryId]: {
                authType: entry.auth?.authType ?? "none",
                username: entry.auth?.username,
                hasCredentials: true,
              },
            }));
            setAuthByRegistry((prev) => ({
              ...prev,
              [registryId]: {
                authType: entry.auth?.authType ?? "none",
                username: entry.auth?.username,
              },
            }));
            credentialsSaved += 1;
          } catch {
            credentialsFailed += 1;
          }
        }
      }

      toast({
        title: "Docker config imported",
        description: `Added ${added}, updated ${updated}. Saved ${credentialsSaved} credentials${credentialsFailed ? ` (${credentialsFailed} failed)` : ""}.`,
      });
    } catch (error) {
      toast({
        title: "Import failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setSelectedRegistryId(previousSelection);
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Container Registries</CardTitle>
        <CardDescription>
          Manage registry endpoints and credentials for image search.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label>Registry</Label>
            <Select
              value={selectedRegistryId}
              onValueChange={setSelectedRegistryId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select registry" />
              </SelectTrigger>
              <SelectContent>
                {registries.map((registry) => (
                  <SelectItem key={registry.id} value={registry.id}>
                    {registry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" onClick={handleRegistryOpen}>
            Add registry
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => removeRegistry(selectedRegistryId)}
            disabled={selectedRegistryId === "docker-hub"}
          >
            Remove
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleImportDockerConfig}
            disabled={importing}
          >
            {importing ? "Importing..." : "Import Docker config"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Docker config import reads ~/.docker/config.json (or
          %USERPROFILE%\\.docker\\config.json on Windows). Credential helpers
          are not imported.
        </p>

        {showRegistryEditor && (
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Provider</Label>
              <Select
                value={newRegistryProvider}
                onValueChange={(value) =>
                  setNewRegistryProvider(value as RegistryProvider)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="registry-v2">Registry V2</SelectItem>
                  <SelectItem value="harbor">Harbor</SelectItem>
                  <SelectItem value="gcr">Google Container Registry</SelectItem>
                  <SelectItem value="ecr">Amazon ECR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Display name
              </Label>
              <Input
                placeholder="My private registry"
                value={newRegistryLabel}
                onChange={(event) => setNewRegistryLabel(event.target.value)}
              />
            </div>
            {(newRegistryProvider === "registry-v2" ||
              newRegistryProvider === "harbor") && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Registry URL
                </Label>
                <Input
                  placeholder="registry.example.com"
                  value={newRegistryUrl}
                  onChange={(event) => setNewRegistryUrl(event.target.value)}
                />
              </div>
            )}
            {newRegistryProvider === "harbor" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Project (optional)
                </Label>
                <Input
                  placeholder="project-name"
                  value={newRegistryProject}
                  onChange={(event) =>
                    setNewRegistryProject(event.target.value)
                  }
                />
              </div>
            )}
            {newRegistryProvider === "gcr" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Host</Label>
                  <Input
                    placeholder="gcr.io"
                    value={newRegistryHost}
                    onChange={(event) => setNewRegistryHost(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Project (optional)
                  </Label>
                  <Input
                    placeholder="my-gcp-project"
                    value={newRegistryProject}
                    onChange={(event) =>
                      setNewRegistryProject(event.target.value)
                    }
                  />
                </div>
              </>
            )}
            {newRegistryProvider === "ecr" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Account ID
                  </Label>
                  <Input
                    placeholder="123456789012"
                    value={newRegistryAccountId}
                    onChange={(event) =>
                      setNewRegistryAccountId(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Region
                  </Label>
                  <Input
                    placeholder="us-east-1"
                    value={newRegistryRegion}
                    onChange={(event) =>
                      setNewRegistryRegion(event.target.value)
                    }
                  />
                </div>
              </>
            )}
            {registryEditorError && (
              <p className="text-xs text-destructive">{registryEditorError}</p>
            )}
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={handleRegistrySave}>
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRegistryCancel}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {selectedRegistry.id !== "docker-hub" && (
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Display name
              </Label>
              <Input
                value={selectedRegistry.label}
                onChange={(event) =>
                  updateRegistry(selectedRegistry.id, {
                    label: event.target.value,
                  })
                }
              />
            </div>
            {(selectedRegistry.provider === "registry-v2" ||
              selectedRegistry.provider === "harbor") && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Registry URL
                </Label>
                <Input
                  placeholder="registry.example.com"
                  value={selectedRegistry.baseUrl ?? ""}
                  onChange={(event) =>
                    updateRegistry(selectedRegistry.id, {
                      baseUrl: event.target.value,
                    })
                  }
                />
              </div>
            )}
            {selectedRegistry.provider === "harbor" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Project (optional)
                </Label>
                <Input
                  placeholder="project-name"
                  value={selectedRegistry.project ?? ""}
                  onChange={(event) =>
                    updateRegistry(selectedRegistry.id, {
                      project: event.target.value,
                    })
                  }
                />
              </div>
            )}
            {selectedRegistry.provider === "gcr" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Host</Label>
                  <Input
                    placeholder="gcr.io"
                    value={selectedRegistry.host ?? ""}
                    onChange={(event) =>
                      updateRegistry(selectedRegistry.id, {
                        host: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Project (optional)
                  </Label>
                  <Input
                    placeholder="my-gcp-project"
                    value={selectedRegistry.project ?? ""}
                    onChange={(event) =>
                      updateRegistry(selectedRegistry.id, {
                        project: event.target.value,
                      })
                    }
                  />
                </div>
              </>
            )}
            {selectedRegistry.provider === "ecr" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Account ID
                  </Label>
                  <Input
                    placeholder="123456789012"
                    value={selectedRegistry.accountId ?? ""}
                    onChange={(event) =>
                      updateRegistry(selectedRegistry.id, {
                        accountId: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Region
                  </Label>
                  <Input
                    placeholder="us-east-1"
                    value={selectedRegistry.region ?? ""}
                    onChange={(event) =>
                      updateRegistry(selectedRegistry.id, {
                        region: event.target.value,
                      })
                    }
                  />
                </div>
              </>
            )}
          </div>
        )}

        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Auth</Label>
            <Select
              value={registryAuth.authType}
              onValueChange={(nextValue) =>
                updateRegistryAuth({
                  ...registryAuth,
                  authType: nextValue as RegistryAuth["authType"],
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select auth" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="bearer">Bearer token</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {registryAuth.authType === "basic" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Username"
                value={registryAuth.username ?? ""}
                onChange={(event) =>
                  updateRegistryAuth({
                    ...registryAuth,
                    username: event.target.value,
                  })
                }
              />
              <Input
                type="password"
                placeholder="Password"
                value={registryAuth.password ?? ""}
                onChange={(event) =>
                  updateRegistryAuth({
                    ...registryAuth,
                    password: event.target.value,
                  })
                }
              />
            </div>
          )}
          {registryAuth.authType === "bearer" && (
            <Input
              type="password"
              placeholder="Token"
              value={registryAuth.token ?? ""}
              onChange={(event) =>
                updateRegistryAuth({
                  ...registryAuth,
                  token: event.target.value,
                })
              }
            />
          )}
          {savedAuthByRegistry[selectedRegistryId]?.hasCredentials && (
            <div className="text-xs text-muted-foreground">
              Saved credentials:{" "}
              {savedAuthByRegistry[selectedRegistryId]?.authType}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                setAuthStatusMessage("");
                try {
                  await invoke("set_registry_credentials", {
                    registryId: selectedRegistryId,
                    auth: registryAuth,
                  });
                  setSavedAuthByRegistry((prev) => ({
                    ...prev,
                    [selectedRegistryId]: {
                      authType: registryAuth.authType,
                      username: registryAuth.username,
                      hasCredentials: registryAuth.authType !== "none",
                    },
                  }));
                  setAuthStatusMessage("Credentials saved.");
                } catch {
                  setAuthStatusMessage("Failed to save credentials.");
                }
              }}
              disabled={registryAuth.authType === "none"}
            >
              Save credentials
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () => {
                setAuthStatusMessage("");
                try {
                  await invoke("delete_registry_credentials", {
                    registryId: selectedRegistryId,
                  });
                  setSavedAuthByRegistry((prev) => ({
                    ...prev,
                    [selectedRegistryId]: null,
                  }));
                  setAuthStatusMessage("Credentials removed.");
                } catch {
                  setAuthStatusMessage("Failed to remove credentials.");
                }
              }}
            >
              Forget
            </Button>
          </div>
          {authStatusMessage && (
            <p className="text-xs text-muted-foreground">{authStatusMessage}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
