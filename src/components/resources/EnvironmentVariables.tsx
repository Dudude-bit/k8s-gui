import { useState } from "react";
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
import { ChevronDown, ChevronRight, Lock, FileKey, Settings, Box } from "lucide-react";
import type { EnvVarInfo, EnvFromInfo, EnvVarSourceType } from "@/generated/types";

interface EnvironmentVariablesProps {
  env: EnvVarInfo[];
  envFrom: EnvFromInfo[];
  containerName?: string;
}

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
}: EnvironmentVariablesProps) {
  const [showSecrets, setShowSecrets] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const hasEnvVars = env.length > 0 || envFrom.length > 0;

  const secretEnvVars = env.filter(
    (e) => e.valueFrom?.sourceType === "secretKeyRef"
  );
  const hasSecrets = secretEnvVars.length > 0 || envFrom.some((ef) => ef.secretRef);

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
                <Switch
                  id={`show-secrets-${containerName}`}
                  checked={showSecrets}
                  onCheckedChange={setShowSecrets}
                />
                <Label htmlFor={`show-secrets-${containerName}`} className="text-sm">
                  Show secrets
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
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {env.map((envVar) => {
                          const isFromSecret =
                            envVar.valueFrom?.sourceType === "secretKeyRef";
                          const displayValue = (() => {
                            if (envVar.valueFrom) {
                              if (isFromSecret && !showSecrets) {
                                return "••••••••";
                              }
                              // For references, show what it references
                              if (envVar.valueFrom.fieldPath) {
                                return envVar.valueFrom.fieldPath;
                              }
                              if (envVar.valueFrom.resource) {
                                return envVar.valueFrom.resource;
                              }
                              // For ConfigMap/Secret refs, show key reference
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
                                className={`font-mono text-xs ${
                                  isFromSecret && !showSecrets
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
