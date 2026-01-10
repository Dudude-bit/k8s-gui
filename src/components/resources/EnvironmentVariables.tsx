import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Lock, FileKey, Settings, Box, Loader2 } from "lucide-react";
import type { EnvVarInfo, EnvFromInfo, EnvVarSourceType } from "@/generated/types";
import { commands } from "@/lib/commands";
import { SecretValueInline } from "@/components/ui/secret-value";

interface EnvironmentVariablesProps {
  env: EnvVarInfo[];
  envFrom: EnvFromInfo[];
  containerName?: string;
  namespace?: string;
}

// Cache for ConfigMap and Secret data
type DataCache = Record<string, Record<string, string>>;

function getSourceIcon(sourceType: EnvVarSourceType) {
  switch (sourceType) {
    case "secretKeyRef":
      return <Lock className="h-3 w-3" />;
    case "configMapKeyRef":
      return <FileKey className="h-3 w-3" />;
    case "fieldRef":
      return <Settings className="h-3 w-3" />;
    case "resourceFieldRef":
      return <Box className="h-3 w-3" />;
    default:
      return null;
  }
}

function getSourceBadgeVariant(sourceType: EnvVarSourceType): "default" | "secondary" | "outline" | "destructive" {
  switch (sourceType) {
    case "secretKeyRef":
      return "destructive";
    case "configMapKeyRef":
      return "secondary";
    default:
      return "outline";
  }
}

function formatSourceLabel(sourceType: EnvVarSourceType): string {
  switch (sourceType) {
    case "secretKeyRef":
      return "Secret";
    case "configMapKeyRef":
      return "ConfigMap";
    case "fieldRef":
      return "Field";
    case "resourceFieldRef":
      return "Resource";
    default:
      return sourceType;
  }
}

export function EnvironmentVariables({
  env,
  envFrom,
  containerName,
  namespace,
}: EnvironmentVariablesProps) {
  const [showSecrets, setShowSecrets] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(true);
  const [secretCache, setSecretCache] = useState<DataCache>({});
  const [configMapCache, setConfigMapCache] = useState<DataCache>({});
  const [loadingSecrets, setLoadingSecrets] = useState(false);
  const [loadingConfigMaps, setLoadingConfigMaps] = useState(false);

  const hasEnvVars = env.length > 0 || envFrom.length > 0;

  const secretEnvVars = env.filter(
    (e) => e.valueFrom?.sourceType === "secretKeyRef"
  );
  const hasSecrets = secretEnvVars.length > 0 || envFrom.some((ef) => ef.secretRef);

  // Get unique secret and configMap names that need to be fetched
  const { secretNames, configMapNames } = useMemo(() => {
    const secrets = new Set<string>();
    const configMaps = new Set<string>();
    for (const envVar of env) {
      if (envVar.valueFrom?.sourceType === "secretKeyRef" && envVar.valueFrom.name) {
        secrets.add(envVar.valueFrom.name);
      }
      if (envVar.valueFrom?.sourceType === "configMapKeyRef" && envVar.valueFrom.name) {
        configMaps.add(envVar.valueFrom.name);
      }
    }
    return { secretNames: Array.from(secrets), configMapNames: Array.from(configMaps) };
  }, [env]);

  // Fetch ConfigMap data on mount (not sensitive, load immediately)
  useEffect(() => {
    if (!namespace || configMapNames.length === 0) return;

    const configMapsToFetch = configMapNames.filter((name) => !(name in configMapCache));
    if (configMapsToFetch.length === 0) return;

    setLoadingConfigMaps(true);

    Promise.all(
      configMapsToFetch.map(async (cmName) => {
        try {
          const data = await commands.getConfigmapData(cmName, namespace);
          return { name: cmName, data };
        } catch {
          return { name: cmName, data: {} };
        }
      })
    )
      .then((results) => {
        setConfigMapCache((prev: DataCache) => {
          const newCache = { ...prev };
          for (const result of results) {
            newCache[result.name] = result.data;
          }
          return newCache;
        });
      })
      .finally(() => {
        setLoadingConfigMaps(false);
      });
  }, [namespace, configMapNames, configMapCache]);

  // Fetch secret data when showSecrets is enabled
  useEffect(() => {
    if (!showSecrets || !namespace || secretNames.length === 0) return;

    const secretsToFetch = secretNames.filter((name) => !(name in secretCache));
    if (secretsToFetch.length === 0) return;

    setLoadingSecrets(true);

    Promise.all(
      secretsToFetch.map(async (secretName) => {
        try {
          const data = await commands.getSecretData(secretName, namespace);
          return { name: secretName, data };
        } catch {
          return { name: secretName, data: {} };
        }
      })
    )
      .then((results) => {
        setSecretCache((prev: DataCache) => {
          const newCache = { ...prev };
          for (const result of results) {
            newCache[result.name] = result.data;
          }
          return newCache;
        });
      })
      .finally(() => {
        setLoadingSecrets(false);
      });
  }, [showSecrets, namespace, secretNames, secretCache]);

  return (
    <Card>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-80">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <CardTitle className="text-base">
                Environment Variables
                {hasEnvVars && (
                  <Badge variant="secondary" className="ml-2">
                    {env.length + envFrom.length}
                  </Badge>
                )}
              </CardTitle>
            </CollapsibleTrigger>
            {hasSecrets && (
              <div className="flex items-center gap-2">
                {loadingSecrets && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <Switch
                  id={`show-secrets-${containerName}`}
                  checked={showSecrets}
                  onCheckedChange={(checked) => {
                    setShowSecrets(checked);
                    // When enabling, reveal all secrets; when disabling, hide all
                    if (checked) {
                      setRevealedSecrets(new Set(secretEnvVars.map(e => e.name)));
                    } else {
                      setRevealedSecrets(new Set());
                    }
                  }}
                  disabled={loadingSecrets}
                />
                <Label htmlFor={`show-secrets-${containerName}`} className="text-sm">
                  Show all secrets
                </Label>
              </div>
            )}
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {!hasEnvVars ? (
              <p className="text-sm text-muted-foreground">No environment variables defined</p>
            ) : (
              <div className="space-y-4">
                {/* EnvFrom section - bulk imports from ConfigMap/Secret */}
                {envFrom.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                      Imported from ConfigMaps/Secrets
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {envFrom.map((ef, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 text-sm border rounded-md px-3 py-1.5 bg-muted/50"
                        >
                          {ef.configMapRef && (
                            <>
                              <FileKey className="h-3 w-3 text-blue-500" />
                              <span>ConfigMap:</span>
                              <code className="text-xs bg-muted px-1 rounded">
                                {ef.configMapRef}
                              </code>
                            </>
                          )}
                          {ef.secretRef && (
                            <>
                              <Lock className="h-3 w-3 text-orange-500" />
                              <span>Secret:</span>
                              <code className="text-xs bg-muted px-1 rounded">
                                {ef.secretRef}
                              </code>
                            </>
                          )}
                          {ef.prefix && (
                            <span className="text-muted-foreground">
                              (prefix: {ef.prefix})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Individual env vars */}
                {env.length > 0 && (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">Name</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead className="w-[180px]">Source</TableHead>
                          <TableHead className="w-[60px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {env.map((envVar) => {
                          const isFromSecret =
                            envVar.valueFrom?.sourceType === "secretKeyRef";
                          const isFromConfigMap =
                            envVar.valueFrom?.sourceType === "configMapKeyRef";
                          const isRevealed = revealedSecrets.has(envVar.name);

                          const toggleReveal = () => {
                            setRevealedSecrets((prev) => {
                              const next = new Set(prev);
                              if (next.has(envVar.name)) {
                                next.delete(envVar.name);
                              } else {
                                next.add(envVar.name);
                              }
                              return next;
                            });
                          };

                          const displayValue = (() => {
                            if (envVar.valueFrom) {
                              if (isFromSecret && !isRevealed) {
                                return "••••••••";
                              }
                              // For secret refs, try to get the actual value from cache
                              if (isFromSecret && isRevealed && envVar.valueFrom.name && envVar.valueFrom.key) {
                                const secretData = secretCache[envVar.valueFrom.name];
                                if (secretData && envVar.valueFrom.key in secretData) {
                                  return secretData[envVar.valueFrom.key];
                                }
                                if (loadingSecrets) {
                                  return "Loading...";
                                }
                                return `(not found: ${envVar.valueFrom.name}:${envVar.valueFrom.key})`;
                              }
                              // For ConfigMap refs, try to get the actual value from cache
                              if (isFromConfigMap && envVar.valueFrom.name && envVar.valueFrom.key) {
                                const cmData = configMapCache[envVar.valueFrom.name];
                                if (cmData && envVar.valueFrom.key in cmData) {
                                  return cmData[envVar.valueFrom.key];
                                }
                                if (loadingConfigMaps) {
                                  return "Loading...";
                                }
                                return `(not found: ${envVar.valueFrom.name}:${envVar.valueFrom.key})`;
                              }
                              // For references, show what it references
                              if (envVar.valueFrom.fieldPath) {
                                return envVar.valueFrom.fieldPath;
                              }
                              if (envVar.valueFrom.resource) {
                                return envVar.valueFrom.resource;
                              }
                              // Fallback for other refs
                              return `${envVar.valueFrom.name || ""}:${envVar.valueFrom.key || ""}`;
                            }
                            return envVar.value || "-";
                          })();

                          return (
                            <TableRow key={envVar.name}>
                              <TableCell className="font-mono text-xs font-medium">
                                {envVar.name}
                              </TableCell>
                              <TableCell
                                className={`font-mono text-xs ${isFromSecret && !isRevealed
                                  ? "text-muted-foreground italic"
                                  : ""
                                  }`}
                              >
                                <span className="break-all">{displayValue}</span>
                              </TableCell>
                              <TableCell>
                                {envVar.valueFrom ? (
                                  <Badge
                                    variant={getSourceBadgeVariant(
                                      envVar.valueFrom.sourceType
                                    )}
                                    className="gap-1"
                                  >
                                    {getSourceIcon(envVar.valueFrom.sourceType)}
                                    {formatSourceLabel(envVar.valueFrom.sourceType)}
                                    {envVar.valueFrom.name && (
                                      <span className="ml-1 opacity-70">
                                        {envVar.valueFrom.name}
                                      </span>
                                    )}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">
                                    Direct value
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {isFromSecret && (
                                  <SecretValueInline
                                    isRevealed={isRevealed}
                                    onToggleReveal={toggleReveal}
                                    isLoading={loadingSecrets}
                                  />
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
