/**
 * Volume Mounts Component
 *
 * Displays volume mounts in a collapsible card with expandable content
 * for Secret and ConfigMap volumes.
 */

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  HardDrive,
  Lock,
  FileKey,
  Database,
  FolderOpen,
  Box,
  Loader2,
} from "lucide-react";
import type { VolumeReference } from "@/generated/types";
import { commands } from "@/lib/commands";
import { SecretKeyValueItem } from "@/components/ui/secret-value";

interface VolumeMountsProps {
  /** Volume mount references */
  volumes: VolumeReference[];
  /** Namespace for fetching Secret/ConfigMap data */
  namespace?: string;
}

// Cache for ConfigMap and Secret data
type DataCache = Record<string, Record<string, string>>;

type VolumeType = "Secret" | "ConfigMap" | "PersistentVolumeClaim" | "EmptyDir" | "Other";

function getVolumeType(kind: string): VolumeType {
  switch (kind.toLowerCase()) {
    case "secret":
      return "Secret";
    case "configmap":
      return "ConfigMap";
    case "persistentvolumeclaim":
    case "pvc":
      return "PersistentVolumeClaim";
    case "emptydir":
      return "EmptyDir";
    default:
      return "Other";
  }
}

function getVolumeIcon(volumeType: VolumeType) {
  switch (volumeType) {
    case "Secret":
      return <Lock className="h-4 w-4 text-orange-500" />;
    case "ConfigMap":
      return <FileKey className="h-4 w-4 text-blue-500" />;
    case "PersistentVolumeClaim":
      return <Database className="h-4 w-4 text-purple-500" />;
    case "EmptyDir":
      return <FolderOpen className="h-4 w-4 text-gray-500" />;
    default:
      return <Box className="h-4 w-4 text-muted-foreground" />;
  }
}

function getVolumeBadgeVariant(
  volumeType: VolumeType
): "default" | "secondary" | "outline" | "destructive" {
  switch (volumeType) {
    case "Secret":
      return "destructive";
    case "ConfigMap":
      return "secondary";
    case "PersistentVolumeClaim":
      return "default";
    default:
      return "outline";
  }
}

interface VolumeMountItemProps {
  volume: VolumeReference;
  volumeType: VolumeType;
  secretData?: Record<string, string>;
  configMapData?: Record<string, string>;
  showSecrets: boolean;
  isLoadingSecret: boolean;
  isLoadingConfigMap: boolean;
}

function VolumeMountItem({
  volume,
  volumeType,
  secretData,
  configMapData,
  showSecrets,
  isLoadingSecret,
  isLoadingConfigMap,
}: VolumeMountItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const hasExpandableContent =
    (volumeType === "Secret" && secretData) ||
    (volumeType === "ConfigMap" && configMapData);

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Auto-reveal all secret keys when showSecrets toggle is on
  useEffect(() => {
    if (showSecrets && secretData) {
      setRevealedKeys(new Set(Object.keys(secretData)));
    } else if (!showSecrets) {
      setRevealedKeys(new Set());
    }
  }, [showSecrets, secretData]);

  const isLoading =
    (volumeType === "Secret" && isLoadingSecret) ||
    (volumeType === "ConfigMap" && isLoadingConfigMap);

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {getVolumeIcon(volumeType)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-medium truncate">
                  {volume.mountPath}
                </span>
                {volume.subPath && (
                  <Badge variant="outline" className="text-xs">
                    subPath: {volume.subPath}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {volume.name}
                {volume.containerName && (
                  <span className="ml-2 opacity-70">
                    ({volume.containerName})
                  </span>
                )}
              </div>
            </div>
            <Badge variant={getVolumeBadgeVariant(volumeType)} className="ml-2">
              {volumeType}
            </Badge>
          </div>
          {hasExpandableContent && (
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 ml-2">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          )}
        </div>
        {hasExpandableContent && (
          <CollapsibleContent>
            <div className="mt-3 pt-3 border-t space-y-2">
              {volumeType === "Secret" && secretData && (
                <>
                  {Object.entries(secretData).length > 0 ? (
                    Object.entries(secretData).map(([key, value]) => (
                      <SecretKeyValueItem
                        key={key}
                        keyName={key}
                        value={value}
                        isRevealed={revealedKeys.has(key)}
                        onToggleReveal={() => toggleReveal(key)}
                        isLoading={isLoadingSecret}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No data keys in secret
                    </p>
                  )}
                </>
              )}
              {volumeType === "ConfigMap" && configMapData && (
                <>
                  {Object.entries(configMapData).length > 0 ? (
                    Object.entries(configMapData).map(([key, value]) => (
                      <div key={key} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <FileKey className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{key}</span>
                          <Badge variant="secondary" className="text-xs">
                            {value.length} chars
                          </Badge>
                        </div>
                        <pre className="bg-muted p-2 rounded text-sm overflow-x-auto whitespace-pre-wrap break-all font-mono max-h-48">
                          {isLoadingConfigMap ? "Loading..." : value}
                        </pre>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No data keys in configmap
                    </p>
                  )}
                </>
              )}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
}

export function VolumeMounts({ volumes, namespace }: VolumeMountsProps) {
  const [showSecrets, setShowSecrets] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [secretCache, setSecretCache] = useState<DataCache>({});
  const [configMapCache, setConfigMapCache] = useState<DataCache>({});
  const [loadingSecrets, setLoadingSecrets] = useState<Set<string>>(new Set());
  const [loadingConfigMaps, setLoadingConfigMaps] = useState<Set<string>>(
    new Set()
  );

  const hasVolumes = volumes.length > 0;

  // Get unique secret and configMap names
  const { secretNames, configMapNames, hasSecrets } = useMemo(() => {
    const secrets = new Set<string>();
    const configMaps = new Set<string>();

    for (const vol of volumes) {
      const volumeType = getVolumeType(vol.kind);
      if (volumeType === "Secret") {
        secrets.add(vol.name);
      } else if (volumeType === "ConfigMap") {
        configMaps.add(vol.name);
      }
    }

    return {
      secretNames: Array.from(secrets),
      configMapNames: Array.from(configMaps),
      hasSecrets: secrets.size > 0,
    };
  }, [volumes]);

  // Fetch ConfigMap data on mount (not sensitive, load immediately)
  useEffect(() => {
    if (!namespace || configMapNames.length === 0) return;

    const configMapsToFetch = configMapNames.filter(
      (name) => !(name in configMapCache)
    );
    if (configMapsToFetch.length === 0) return;

    setLoadingConfigMaps(new Set(configMapsToFetch));

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
        setLoadingConfigMaps(new Set());
      });
  }, [namespace, configMapNames, configMapCache]);

  // Fetch secret data when showSecrets is enabled
  useEffect(() => {
    if (!showSecrets || !namespace || secretNames.length === 0) return;

    const secretsToFetch = secretNames.filter((name) => !(name in secretCache));
    if (secretsToFetch.length === 0) return;

    setLoadingSecrets(new Set(secretsToFetch));

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
        setLoadingSecrets(new Set());
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
              <CardTitle className="text-base flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Volume Mounts
                {hasVolumes && (
                  <Badge variant="secondary" className="ml-2">
                    {volumes.length}
                  </Badge>
                )}
              </CardTitle>
            </CollapsibleTrigger>
            {hasSecrets && (
              <div className="flex items-center gap-2">
                {loadingSecrets.size > 0 && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <Switch
                  id="show-volume-secrets"
                  checked={showSecrets}
                  onCheckedChange={setShowSecrets}
                  disabled={loadingSecrets.size > 0}
                />
                <Label htmlFor="show-volume-secrets" className="text-sm">
                  Show secrets
                </Label>
              </div>
            )}
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {!hasVolumes ? (
              <p className="text-sm text-muted-foreground">
                No volume mounts defined
              </p>
            ) : (
              <div className="space-y-3">
                {volumes.map((volume, index) => {
                  const volumeType = getVolumeType(volume.kind);
                  const secretData =
                    volumeType === "Secret"
                      ? secretCache[volume.name]
                      : undefined;
                  const configMapData =
                    volumeType === "ConfigMap"
                      ? configMapCache[volume.name]
                      : undefined;

                  return (
                    <VolumeMountItem
                      key={`${volume.name}-${volume.mountPath}-${index}`}
                      volume={volume}
                      volumeType={volumeType}
                      secretData={secretData}
                      configMapData={configMapData}
                      showSecrets={showSecrets}
                      isLoadingSecret={loadingSecrets.has(volume.name)}
                      isLoadingConfigMap={loadingConfigMaps.has(volume.name)}
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
