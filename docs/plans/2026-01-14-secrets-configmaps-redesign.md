# Secrets, ConfigMaps & Environment Variables Redesign - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Унифицировать отображение Secrets, ConfigMaps и переменных окружения с полным охватом всех типов использования и обратными ссылками.

**Architecture:** Семейство компонентов с общей базой из примитивов. Новый backend endpoint для получения обратных ссылок. Объединённый Configuration view для контейнеров.

**Tech Stack:** React, TypeScript, Tauri (Rust), shadcn/ui, TanStack Query

**Design Doc:** `docs/plans/2026-01-14-secrets-configmaps-redesign-design.md`

---

## Task 1: Create `source-badge.tsx` UI Primitive

**Files:**
- Create: `src/components/ui/source-badge.tsx`
- Modify: `src/components/ui/index.ts`

**Step 1: Create the SourceBadge component**

```tsx
// src/components/ui/source-badge.tsx
import { Badge } from "@/components/ui/badge";
import { Lock, FileKey, Settings, Box, HardDrive, Globe } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type SourceType =
  | "secret"
  | "configmap"
  | "direct"
  | "field"
  | "resource"
  | "envFromSecret"
  | "envFromConfigMap"
  | "volume"
  | "tls";

interface SourceBadgeProps {
  type: SourceType;
  name?: string;
  namespace?: string;
  className?: string;
  linkable?: boolean;
}

const sourceConfig: Record<SourceType, {
  label: string;
  icon: React.ElementType;
  variant: "default" | "secondary" | "outline" | "destructive";
  color?: string;
}> = {
  secret: {
    label: "Secret",
    icon: Lock,
    variant: "destructive",
  },
  configmap: {
    label: "ConfigMap",
    icon: FileKey,
    variant: "secondary",
  },
  direct: {
    label: "Direct",
    icon: Settings,
    variant: "outline",
  },
  field: {
    label: "Field",
    icon: Settings,
    variant: "outline",
  },
  resource: {
    label: "Resource",
    icon: Box,
    variant: "outline",
  },
  envFromSecret: {
    label: "EnvFrom Secret",
    icon: Lock,
    variant: "destructive",
  },
  envFromConfigMap: {
    label: "EnvFrom ConfigMap",
    icon: FileKey,
    variant: "secondary",
  },
  volume: {
    label: "Volume",
    icon: HardDrive,
    variant: "outline",
  },
  tls: {
    label: "TLS",
    icon: Globe,
    variant: "outline",
  },
};

export function SourceBadge({
  type,
  name,
  namespace,
  className,
  linkable = true,
}: SourceBadgeProps) {
  const config = sourceConfig[type];
  const Icon = config.icon;

  const content = (
    <Badge variant={config.variant} className={cn("gap-1", className)}>
      <Icon className="h-3 w-3" />
      {config.label}
      {name && <span className="ml-1 opacity-70">{name}</span>}
    </Badge>
  );

  if (linkable && name && namespace && (type === "secret" || type === "configmap" || type === "envFromSecret" || type === "envFromConfigMap")) {
    const resourceType = type.includes("secret") ? "secrets" : "configmaps";
    const path = `/configuration/${resourceType}/${namespace}/${name}`;
    return (
      <Link to={path} className="hover:opacity-80 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
```

**Step 2: Export from index.ts**

Add to `src/components/ui/index.ts`:
```tsx
export { SourceBadge } from "./source-badge";
export type { SourceType } from "./source-badge";
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/ui/source-badge.tsx src/components/ui/index.ts
git commit -m "feat(ui): add SourceBadge component for unified source display"
```

---

## Task 2: Create `masked-value.tsx` UI Primitive

**Files:**
- Create: `src/components/ui/masked-value.tsx`
- Modify: `src/components/ui/index.ts`

**Step 1: Create the MaskedValue component**

```tsx
// src/components/ui/masked-value.tsx
import { Button } from "@/components/ui/button";
import { Copy, Eye, EyeOff } from "lucide-react";
import { useCopyToClipboard } from "@/hooks";
import { cn } from "@/lib/utils";

interface MaskedValueProps {
  value: string;
  isRevealed: boolean;
  onToggleReveal?: () => void;
  showCopy?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  copyLabel?: string;
  /** Compact mode for table cells */
  compact?: boolean;
}

export function MaskedValue({
  value,
  isRevealed,
  onToggleReveal,
  showCopy = true,
  isLoading = false,
  placeholder = "••••••••",
  className,
  copyLabel = "Value copied to clipboard",
  compact = false,
}: MaskedValueProps) {
  const copyToClipboard = useCopyToClipboard();
  const displayValue = isRevealed ? value : placeholder;

  const handleCopy = () => {
    copyToClipboard(value, copyLabel);
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <span className={cn(
          "font-mono text-xs break-all",
          !isRevealed && "text-muted-foreground italic"
        )}>
          {isLoading ? "Loading..." : displayValue}
        </span>
        {onToggleReveal && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleReveal}
            disabled={isLoading}
            className="h-6 w-6 p-0 shrink-0"
          >
            {isRevealed ? (
              <EyeOff className="h-3 w-3" />
            ) : (
              <Eye className="h-3 w-3" />
            )}
          </Button>
        )}
        {showCopy && isRevealed && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={isLoading}
            className="h-6 w-6 p-0 shrink-0"
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <pre className="bg-muted p-2 rounded text-sm overflow-x-auto whitespace-pre-wrap break-all font-mono flex-1">
        {isLoading ? "Loading..." : displayValue}
      </pre>
      <div className="flex items-center gap-1 shrink-0">
        {onToggleReveal && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleReveal}
            disabled={isLoading}
            className="h-8 w-8 p-0"
          >
            {isRevealed ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        )}
        {showCopy && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={isLoading}
            className="h-8 w-8 p-0"
          >
            <Copy className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Export from index.ts**

Add to `src/components/ui/index.ts`:
```tsx
export { MaskedValue } from "./masked-value";
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/ui/masked-value.tsx src/components/ui/index.ts
git commit -m "feat(ui): add MaskedValue component for sensitive data display"
```

---

## Task 3: Create `src/components/shared/` Directory and `resource-link.tsx`

**Files:**
- Create: `src/components/shared/resource-link.tsx`
- Create: `src/components/shared/index.ts`

**Step 1: Create shared directory and resource-link component**

```tsx
// src/components/shared/resource-link.tsx
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { getResourceIcon } from "@/lib/resource-registry";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import { cn } from "@/lib/utils";

interface ResourceLinkProps {
  kind: string;
  name: string;
  namespace?: string;
  className?: string;
  showKindBadge?: boolean;
  /** Additional info to display (e.g., container name) */
  subtitle?: string;
}

export function ResourceLink({
  kind,
  name,
  namespace,
  className,
  showKindBadge = true,
  subtitle,
}: ResourceLinkProps) {
  const Icon = getResourceIcon(kind);
  const path = getResourceDetailUrl(kind, name, namespace);

  return (
    <Link
      to={path}
      className={cn(
        "flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent transition-colors",
        className
      )}
    >
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="font-medium truncate">{name}</span>
        {subtitle && (
          <span className="text-xs text-muted-foreground truncate">{subtitle}</span>
        )}
      </div>
      {showKindBadge && (
        <Badge variant="outline" className="ml-auto text-xs shrink-0">
          {kind}
        </Badge>
      )}
    </Link>
  );
}
```

**Step 2: Create index.ts**

```tsx
// src/components/shared/index.ts
export { ResourceLink } from "./resource-link";
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/shared/
git commit -m "feat(shared): add ResourceLink component for resource navigation"
```

---

## Task 4: Create `key-value-list.tsx` Shared Component

**Files:**
- Create: `src/components/shared/key-value-list.tsx`
- Modify: `src/components/shared/index.ts`

**Step 1: Create the KeyValueList component**

```tsx
// src/components/shared/key-value-list.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MaskedValue } from "@/components/ui/masked-value";
import { Copy, Eye, EyeOff, Key, ShieldAlert } from "lucide-react";
import { useCopyToClipboard } from "@/hooks";

interface KeyValueListProps {
  data: Record<string, string>;
  title?: string;
  /** Whether values should be masked (for secrets) */
  isSensitive?: boolean;
  /** Show sensitive badge */
  showSensitiveBadge?: boolean;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function KeyValueList({
  data,
  title = "Data",
  isSensitive = false,
  showSensitiveBadge = false,
  isLoading = false,
  emptyMessage = "No data defined",
}: KeyValueListProps) {
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const copyToClipboard = useCopyToClipboard();

  const entries = Object.entries(data);

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

  const revealAll = () => {
    setRevealedKeys(new Set(Object.keys(data)));
  };

  const hideAll = () => {
    setRevealedKeys(new Set());
  };

  const handleCopyAll = () => {
    copyToClipboard(JSON.stringify(data, null, 2), "All data copied to clipboard.");
  };

  const handleCopyValue = (key: string, value: string) => {
    copyToClipboard(value, `Value of "${key}" copied to clipboard.`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">
            {title} ({entries.length})
          </CardTitle>
          {showSensitiveBadge && isSensitive && (
            <Badge variant="outline" className="text-xs">
              <ShieldAlert className="h-3 w-3 mr-1" />
              Sensitive
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <>
              {isSensitive && (
                <>
                  <Button variant="outline" size="sm" onClick={revealAll} disabled={isLoading}>
                    <Eye className="h-4 w-4 mr-2" />
                    Reveal All
                  </Button>
                  <Button variant="outline" size="sm" onClick={hideAll} disabled={isLoading}>
                    <EyeOff className="h-4 w-4 mr-2" />
                    Hide All
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={handleCopyAll} disabled={isLoading}>
                <Copy className="h-4 w-4 mr-2" />
                Copy All
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium font-mono text-sm">{key}</span>
                  <Badge variant="secondary" className="text-xs">
                    {value.length} chars
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  {isSensitive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleReveal(key)}
                      disabled={isLoading}
                      className="h-8 w-8 p-0"
                    >
                      {revealedKeys.has(key) ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyValue(key, value)}
                    disabled={isLoading}
                    className="h-8 w-8 p-0"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {isSensitive ? (
                <MaskedValue
                  value={value}
                  isRevealed={revealedKeys.has(key)}
                  showCopy={false}
                  isLoading={isLoading}
                />
              ) : (
                <pre className="bg-muted p-2 rounded text-sm overflow-x-auto whitespace-pre-wrap break-all font-mono">
                  {isLoading ? "Loading..." : value}
                </pre>
              )}
            </div>
          ))}
          {entries.length === 0 && !isLoading && (
            <p className="text-muted-foreground text-sm">{emptyMessage}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Export from index.ts**

Add to `src/components/shared/index.ts`:
```tsx
export { KeyValueList } from "./key-value-list";
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/shared/key-value-list.tsx src/components/shared/index.ts
git commit -m "feat(shared): add KeyValueList component for unified data display"
```

---

## Task 5: Add Backend Command `get_resource_references`

**Files:**
- Modify: `src-tauri/src/commands/config_resources.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Add types and command to config_resources.rs**

Add at the end of `src-tauri/src/commands/config_resources.rs`:

```rust
use k8s_openapi::api::apps::v1::{DaemonSet, Deployment, StatefulSet};
use k8s_openapi::api::batch::v1::{CronJob, Job};
use k8s_openapi::api::core::v1::Pod;
use k8s_openapi::api::networking::v1::Ingress;
use kube::api::ListParams;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResourceReference {
    pub kind: String,
    pub name: String,
    pub namespace: String,
    pub container_name: Option<String>,
    pub key: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VolumeReference {
    pub kind: String,
    pub name: String,
    pub namespace: String,
    pub container_name: Option<String>,
    pub mount_path: String,
    pub sub_path: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IngressReference {
    pub name: String,
    pub namespace: String,
    pub hosts: Vec<String>,
}

#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResourceReferences {
    pub env_vars: Vec<ResourceReference>,
    pub env_from: Vec<ResourceReference>,
    pub volumes: Vec<VolumeReference>,
    pub image_pull_secrets: Vec<ResourceReference>,
    pub tls_ingress: Vec<IngressReference>,
}

/// Get resources that reference a Secret or ConfigMap
#[tauri::command]
pub async fn get_resource_references(
    resource_type: String,
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ResourceReferences> {
    crate::validation::validate_dns_subdomain(&name)?;
    let ctx = ResourceContext::for_command(&state, namespace.clone())?;
    let ns = ctx.namespace.clone();
    let is_secret = resource_type.to_lowercase() == "secret";

    let mut refs = ResourceReferences::default();

    // Helper to check pod spec for references
    let check_pod_spec = |spec: &k8s_openapi::api::core::v1::PodSpec,
                          kind: &str,
                          resource_name: &str,
                          resource_ns: &str|
     -> (Vec<ResourceReference>, Vec<ResourceReference>, Vec<VolumeReference>, Vec<ResourceReference>) {
        let mut env_refs = Vec::new();
        let mut env_from_refs = Vec::new();
        let mut vol_refs = Vec::new();
        let mut pull_refs = Vec::new();

        // Check containers
        for container in spec.containers.iter() {
            // Check env vars
            if let Some(env) = &container.env {
                for e in env {
                    if let Some(value_from) = &e.value_from {
                        let matches = if is_secret {
                            value_from.secret_key_ref.as_ref().map(|r| &r.name) == Some(&Some(name.clone()))
                        } else {
                            value_from.config_map_key_ref.as_ref().map(|r| &r.name) == Some(&Some(name.clone()))
                        };
                        if matches {
                            let key = if is_secret {
                                value_from.secret_key_ref.as_ref().and_then(|r| r.key.clone())
                            } else {
                                value_from.config_map_key_ref.as_ref().and_then(|r| r.key.clone())
                            };
                            env_refs.push(ResourceReference {
                                kind: kind.to_string(),
                                name: resource_name.to_string(),
                                namespace: resource_ns.to_string(),
                                container_name: Some(container.name.clone()),
                                key,
                            });
                        }
                    }
                }
            }

            // Check envFrom
            if let Some(env_from) = &container.env_from {
                for ef in env_from {
                    let matches = if is_secret {
                        ef.secret_ref.as_ref().map(|r| &r.name) == Some(&Some(name.clone()))
                    } else {
                        ef.config_map_ref.as_ref().map(|r| &r.name) == Some(&Some(name.clone()))
                    };
                    if matches {
                        env_from_refs.push(ResourceReference {
                            kind: kind.to_string(),
                            name: resource_name.to_string(),
                            namespace: resource_ns.to_string(),
                            container_name: Some(container.name.clone()),
                            key: None,
                        });
                    }
                }
            }
        }

        // Check volumes
        if let Some(volumes) = &spec.volumes {
            for vol in volumes {
                let matches = if is_secret {
                    vol.secret.as_ref().map(|s| &s.secret_name) == Some(&Some(name.clone()))
                } else {
                    vol.config_map.as_ref().map(|c| &c.name) == Some(&Some(name.clone()))
                };
                if matches {
                    // Find mount paths for this volume
                    for container in spec.containers.iter() {
                        if let Some(mounts) = &container.volume_mounts {
                            for mount in mounts {
                                if mount.name == vol.name {
                                    vol_refs.push(VolumeReference {
                                        kind: kind.to_string(),
                                        name: resource_name.to_string(),
                                        namespace: resource_ns.to_string(),
                                        container_name: Some(container.name.clone()),
                                        mount_path: mount.mount_path.clone(),
                                        sub_path: mount.sub_path.clone(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // Check imagePullSecrets (only for secrets)
        if is_secret {
            if let Some(pull_secrets) = &spec.image_pull_secrets {
                for ps in pull_secrets {
                    if ps.name.as_ref() == Some(&name) {
                        pull_refs.push(ResourceReference {
                            kind: kind.to_string(),
                            name: resource_name.to_string(),
                            namespace: resource_ns.to_string(),
                            container_name: None,
                            key: None,
                        });
                    }
                }
            }
        }

        (env_refs, env_from_refs, vol_refs, pull_refs)
    };

    // Check Pods
    let pods_api: kube::Api<Pod> = kube::Api::namespaced(ctx.client.clone(), &ns);
    if let Ok(pods) = pods_api.list(&ListParams::default()).await {
        for pod in pods.items {
            if let Some(spec) = &pod.spec {
                let pod_name = pod.metadata.name.clone().unwrap_or_default();
                let (env, env_from, vols, pulls) = check_pod_spec(spec, "Pod", &pod_name, &ns);
                refs.env_vars.extend(env);
                refs.env_from.extend(env_from);
                refs.volumes.extend(vols);
                refs.image_pull_secrets.extend(pulls);
            }
        }
    }

    // Check Deployments
    let deploy_api: kube::Api<Deployment> = kube::Api::namespaced(ctx.client.clone(), &ns);
    if let Ok(deploys) = deploy_api.list(&ListParams::default()).await {
        for deploy in deploys.items {
            if let Some(spec) = deploy.spec.and_then(|s| s.template.spec) {
                let name = deploy.metadata.name.clone().unwrap_or_default();
                let (env, env_from, vols, pulls) = check_pod_spec(&spec, "Deployment", &name, &ns);
                refs.env_vars.extend(env);
                refs.env_from.extend(env_from);
                refs.volumes.extend(vols);
                refs.image_pull_secrets.extend(pulls);
            }
        }
    }

    // Check StatefulSets
    let sts_api: kube::Api<StatefulSet> = kube::Api::namespaced(ctx.client.clone(), &ns);
    if let Ok(stss) = sts_api.list(&ListParams::default()).await {
        for sts in stss.items {
            if let Some(spec) = sts.spec.and_then(|s| s.template.spec) {
                let name = sts.metadata.name.clone().unwrap_or_default();
                let (env, env_from, vols, pulls) = check_pod_spec(&spec, "StatefulSet", &name, &ns);
                refs.env_vars.extend(env);
                refs.env_from.extend(env_from);
                refs.volumes.extend(vols);
                refs.image_pull_secrets.extend(pulls);
            }
        }
    }

    // Check DaemonSets
    let ds_api: kube::Api<DaemonSet> = kube::Api::namespaced(ctx.client.clone(), &ns);
    if let Ok(dss) = ds_api.list(&ListParams::default()).await {
        for ds in dss.items {
            if let Some(spec) = ds.spec.and_then(|s| s.template.spec) {
                let name = ds.metadata.name.clone().unwrap_or_default();
                let (env, env_from, vols, pulls) = check_pod_spec(&spec, "DaemonSet", &name, &ns);
                refs.env_vars.extend(env);
                refs.env_from.extend(env_from);
                refs.volumes.extend(vols);
                refs.image_pull_secrets.extend(pulls);
            }
        }
    }

    // Check Jobs
    let job_api: kube::Api<Job> = kube::Api::namespaced(ctx.client.clone(), &ns);
    if let Ok(jobs) = job_api.list(&ListParams::default()).await {
        for job in jobs.items {
            if let Some(spec) = job.spec.and_then(|s| s.template.spec) {
                let name = job.metadata.name.clone().unwrap_or_default();
                let (env, env_from, vols, pulls) = check_pod_spec(&spec, "Job", &name, &ns);
                refs.env_vars.extend(env);
                refs.env_from.extend(env_from);
                refs.volumes.extend(vols);
                refs.image_pull_secrets.extend(pulls);
            }
        }
    }

    // Check CronJobs
    let cj_api: kube::Api<CronJob> = kube::Api::namespaced(ctx.client.clone(), &ns);
    if let Ok(cjs) = cj_api.list(&ListParams::default()).await {
        for cj in cjs.items {
            if let Some(spec) = cj.spec.and_then(|s| s.job_template.spec).and_then(|s| s.template.spec) {
                let name = cj.metadata.name.clone().unwrap_or_default();
                let (env, env_from, vols, pulls) = check_pod_spec(&spec, "CronJob", &name, &ns);
                refs.env_vars.extend(env);
                refs.env_from.extend(env_from);
                refs.volumes.extend(vols);
                refs.image_pull_secrets.extend(pulls);
            }
        }
    }

    // Check Ingress TLS (only for secrets)
    if is_secret {
        let ingress_api: kube::Api<Ingress> = kube::Api::namespaced(ctx.client.clone(), &ns);
        if let Ok(ingresses) = ingress_api.list(&ListParams::default()).await {
            for ingress in ingresses.items {
                if let Some(spec) = &ingress.spec {
                    if let Some(tls_configs) = &spec.tls {
                        for tls in tls_configs {
                            if tls.secret_name.as_ref() == Some(&name) {
                                refs.tls_ingress.push(IngressReference {
                                    name: ingress.metadata.name.clone().unwrap_or_default(),
                                    namespace: ns.clone(),
                                    hosts: tls.hosts.clone().unwrap_or_default(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(refs)
}
```

**Step 2: Export command in mod.rs**

Add to `src-tauri/src/commands/mod.rs`:
```rust
pub use config_resources::get_resource_references;
```

**Step 3: Register command in main.rs**

Find the `.invoke_handler(tauri::generate_handler![...])` section in `src-tauri/src/main.rs` and add:
```rust
commands::get_resource_references,
```

**Step 4: Verify Rust build**

Run: `cd src-tauri && cargo check`
Expected: Compilation succeeds

**Step 5: Commit**

```bash
git add src-tauri/src/commands/config_resources.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat(backend): add get_resource_references command for reverse lookups"
```

---

## Task 6: Generate TypeScript Types and Update Commands

**Files:**
- Types auto-generated to: `src/generated/types.ts`
- Commands auto-generated to: `src/generated/commands.ts`

**Step 1: Run Tauri to regenerate types**

Run: `npm run tauri build` or the type generation script if available.

Alternative: Manually add types to a local file if generator not available.

**Step 2: Verify types exist**

Check that `ResourceReferences`, `ResourceReference`, `VolumeReference`, `IngressReference` are in `src/generated/types.ts`

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit if manual changes**

```bash
git add src/generated/
git commit -m "chore: regenerate TypeScript types for resource references"
```

---

## Task 7: Create `referenced-by.tsx` Component

**Files:**
- Create: `src/components/resources/ReferencedBy.tsx`
- Modify: `src/components/resources/index.ts`

**Step 1: Create the ReferencedBy component**

```tsx
// src/components/resources/ReferencedBy.tsx
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Layers, Lock, FileKey, HardDrive, Globe, Image } from "lucide-react";
import { useState } from "react";
import { ResourceLink } from "@/components/shared";
import { commands } from "@/lib/commands";
import type { ResourceReferences } from "@/generated/types";

interface ReferencedByProps {
  resourceType: "Secret" | "ConfigMap";
  name: string;
  namespace: string;
}

interface SectionProps {
  title: string;
  icon: React.ElementType;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, icon: Icon, count, defaultOpen = false, children }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen || count > 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 hover:bg-muted/50 rounded-md transition-colors">
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">{title}</span>
        <Badge variant={count > 0 ? "default" : "secondary"} className="ml-auto">
          {count}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-8 pr-2 pb-2 space-y-2">
        {count === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No references found</p>
        ) : (
          children
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ReferencedBy({ resourceType, name, namespace }: ReferencedByProps) {
  const { data, isLoading, error } = useQuery<ResourceReferences>({
    queryKey: ["resourceReferences", resourceType, name, namespace],
    queryFn: () => commands.getResourceReferences(resourceType, name, namespace),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6" />
          <span className="ml-2 text-muted-foreground">Loading references...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-destructive text-sm">Failed to load references: {String(error)}</p>
        </CardContent>
      </Card>
    );
  }

  const refs = data || { envVars: [], envFrom: [], volumes: [], imagePullSecrets: [], tlsIngress: [] };
  const totalCount = refs.envVars.length + refs.envFrom.length + refs.volumes.length +
                     refs.imagePullSecrets.length + refs.tlsIngress.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Referenced By
          <Badge variant="secondary" className="ml-2">{totalCount}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <Section
          title="Environment Variables"
          icon={resourceType === "Secret" ? Lock : FileKey}
          count={refs.envVars.length}
          defaultOpen={refs.envVars.length > 0}
        >
          {refs.envVars.map((ref, i) => (
            <ResourceLink
              key={`env-${i}`}
              kind={ref.kind}
              name={ref.name}
              namespace={ref.namespace}
              subtitle={ref.containerName ? `Container: ${ref.containerName}${ref.key ? ` → ${ref.key}` : ""}` : undefined}
            />
          ))}
        </Section>

        <Section
          title="EnvFrom (Bulk Import)"
          icon={resourceType === "Secret" ? Lock : FileKey}
          count={refs.envFrom.length}
          defaultOpen={refs.envFrom.length > 0}
        >
          {refs.envFrom.map((ref, i) => (
            <ResourceLink
              key={`envfrom-${i}`}
              kind={ref.kind}
              name={ref.name}
              namespace={ref.namespace}
              subtitle={ref.containerName ? `Container: ${ref.containerName} (all keys)` : undefined}
            />
          ))}
        </Section>

        <Section
          title="Volume Mounts"
          icon={HardDrive}
          count={refs.volumes.length}
          defaultOpen={refs.volumes.length > 0}
        >
          {refs.volumes.map((ref, i) => (
            <ResourceLink
              key={`vol-${i}`}
              kind={ref.kind}
              name={ref.name}
              namespace={ref.namespace}
              subtitle={`${ref.containerName ? `${ref.containerName} → ` : ""}${ref.mountPath}`}
            />
          ))}
        </Section>

        {resourceType === "Secret" && (
          <>
            <Section
              title="Image Pull Secrets"
              icon={Image}
              count={refs.imagePullSecrets.length}
            >
              {refs.imagePullSecrets.map((ref, i) => (
                <ResourceLink
                  key={`pull-${i}`}
                  kind={ref.kind}
                  name={ref.name}
                  namespace={ref.namespace}
                />
              ))}
            </Section>

            <Section
              title="TLS Ingress"
              icon={Globe}
              count={refs.tlsIngress.length}
            >
              {refs.tlsIngress.map((ref, i) => (
                <ResourceLink
                  key={`tls-${i}`}
                  kind="Ingress"
                  name={ref.name}
                  namespace={ref.namespace}
                  subtitle={ref.hosts.length > 0 ? `Hosts: ${ref.hosts.join(", ")}` : undefined}
                />
              ))}
            </Section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Export from index.ts**

Add to `src/components/resources/index.ts`:
```tsx
export { ReferencedBy } from "./ReferencedBy";
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/resources/ReferencedBy.tsx src/components/resources/index.ts
git commit -m "feat(resources): add ReferencedBy component for reverse reference display"
```

---

## Task 8: Update SecretDetail to Use New Components

**Files:**
- Modify: `src/pages/SecretDetail.tsx`

**Step 1: Read current SecretDetail.tsx**

Review the existing implementation to understand the current structure.

**Step 2: Update to use KeyValueList and add Referenced By tab**

Replace the Data tab content with `KeyValueList` component.
Add "Referenced By" tab using `ReferencedBy` component.

Key changes:
- Import `KeyValueList` from `@/components/shared`
- Import `ReferencedBy` from `@/components/resources`
- Add "Referenced By" tab to the Tabs component
- Use `KeyValueList` with `isSensitive={true}` for secret data

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/pages/SecretDetail.tsx
git commit -m "refactor(secrets): use unified KeyValueList and add Referenced By tab"
```

---

## Task 9: Update ConfigMapDetail to Use New Components

**Files:**
- Modify: `src/pages/ConfigMapDetail.tsx`

**Step 1: Read current ConfigMapDetail.tsx**

Review the existing implementation.

**Step 2: Update to use KeyValueList and add Referenced By tab**

Key changes:
- Import `KeyValueList` from `@/components/shared`
- Import `ReferencedBy` from `@/components/resources`
- Add "Referenced By" tab
- Use `KeyValueList` with `isSensitive={false}` for configmap data

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/pages/ConfigMapDetail.tsx
git commit -m "refactor(configmaps): use unified KeyValueList and add Referenced By tab"
```

---

## Task 10: Create VolumeMounts Component

**Files:**
- Create: `src/components/resources/VolumeMounts.tsx`
- Modify: `src/components/resources/index.ts`

**Step 1: Create VolumeMounts component**

```tsx
// src/components/resources/VolumeMounts.tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, HardDrive, Lock, FileKey, Database, Eye, EyeOff } from "lucide-react";
import { SourceBadge } from "@/components/ui/source-badge";
import { MaskedValue } from "@/components/ui/masked-value";
import { commands } from "@/lib/commands";
import type { VolumeInfo, VolumeMountInfo } from "@/generated/types";

interface VolumeMountsProps {
  volumes: VolumeInfo[];
  volumeMounts: VolumeMountInfo[];
  namespace?: string;
}

type VolumeSourceType = "secret" | "configmap" | "pvc" | "emptyDir" | "hostPath" | "other";

function getVolumeSourceType(volume: VolumeInfo): VolumeSourceType {
  if (volume.secret) return "secret";
  if (volume.configMap) return "configmap";
  if (volume.persistentVolumeClaim) return "pvc";
  if (volume.emptyDir) return "emptyDir";
  if (volume.hostPath) return "hostPath";
  return "other";
}

function getVolumeSourceName(volume: VolumeInfo): string | null {
  if (volume.secret) return volume.secret.secretName || null;
  if (volume.configMap) return volume.configMap.name || null;
  if (volume.persistentVolumeClaim) return volume.persistentVolumeClaim.claimName;
  return null;
}

function getVolumeIcon(type: VolumeSourceType) {
  switch (type) {
    case "secret":
      return Lock;
    case "configmap":
      return FileKey;
    case "pvc":
      return Database;
    default:
      return HardDrive;
  }
}

export function VolumeMounts({ volumes, volumeMounts, namespace }: VolumeMountsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(new Set());
  const [volumeData, setVolumeData] = useState<Record<string, Record<string, string>>>({});
  const [loadingVolumes, setLoadingVolumes] = useState<Set<string>>(new Set());
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const hasVolumes = volumeMounts.length > 0;

  // Map volumes by name for easy lookup
  const volumeMap = new Map(volumes.map(v => [v.name, v]));

  const toggleVolumeExpand = async (volumeName: string) => {
    const volume = volumeMap.get(volumeName);
    if (!volume || !namespace) return;

    const isCurrentlyExpanded = expandedVolumes.has(volumeName);

    if (isCurrentlyExpanded) {
      setExpandedVolumes(prev => {
        const next = new Set(prev);
        next.delete(volumeName);
        return next;
      });
      return;
    }

    // Fetch data if not already loaded
    if (!volumeData[volumeName]) {
      const sourceType = getVolumeSourceType(volume);
      const sourceName = getVolumeSourceName(volume);

      if (sourceName && (sourceType === "secret" || sourceType === "configmap")) {
        setLoadingVolumes(prev => new Set(prev).add(volumeName));
        try {
          const data = sourceType === "secret"
            ? await commands.getSecretData(sourceName, namespace)
            : await commands.getConfigmapData(sourceName, namespace);
          setVolumeData(prev => ({ ...prev, [volumeName]: data }));
        } catch (error) {
          console.error(`Failed to fetch ${sourceType} data:`, error);
        } finally {
          setLoadingVolumes(prev => {
            const next = new Set(prev);
            next.delete(volumeName);
            return next;
          });
        }
      }
    }

    setExpandedVolumes(prev => new Set(prev).add(volumeName));
  };

  return (
    <Card>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-80">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <CardTitle className="text-base">
              Volume Mounts
              {hasVolumes && (
                <Badge variant="secondary" className="ml-2">{volumeMounts.length}</Badge>
              )}
            </CardTitle>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {!hasVolumes ? (
              <p className="text-sm text-muted-foreground">No volumes mounted</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Mount Path</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="w-[100px]">Keys</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {volumeMounts.map((mount) => {
                      const volume = volumeMap.get(mount.name);
                      const sourceType = volume ? getVolumeSourceType(volume) : "other";
                      const sourceName = volume ? getVolumeSourceName(volume) : null;
                      const Icon = getVolumeIcon(sourceType);
                      const isExpandable = sourceType === "secret" || sourceType === "configmap";
                      const isExpanded = expandedVolumes.has(mount.name);
                      const isLoading = loadingVolumes.has(mount.name);
                      const data = volumeData[mount.name];
                      const isSensitive = sourceType === "secret";

                      return (
                        <>
                          <TableRow key={mount.name}>
                            <TableCell className="font-mono text-xs">
                              {mount.mountPath}
                              {mount.subPath && (
                                <span className="text-muted-foreground ml-1">
                                  (subPath: {mount.subPath})
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                                <SourceBadge
                                  type={sourceType === "secret" ? "volume" : sourceType === "configmap" ? "configmap" : "direct"}
                                  name={sourceName || mount.name}
                                  namespace={namespace}
                                  linkable={isExpandable}
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {data ? `${Object.keys(data).length} keys` : "—"}
                            </TableCell>
                            <TableCell>
                              {isExpandable && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleVolumeExpand(mount.name)}
                                  disabled={isLoading}
                                  className="h-8 w-8 p-0"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                          {isExpanded && data && (
                            <TableRow>
                              <TableCell colSpan={4} className="bg-muted/30">
                                <div className="p-2 space-y-2">
                                  {Object.entries(data).map(([key, value]) => {
                                    const fullKey = `${mount.name}:${key}`;
                                    const isRevealed = revealedKeys.has(fullKey);
                                    return (
                                      <div key={key} className="flex items-start gap-2">
                                        <span className="font-mono text-xs font-medium min-w-[100px] pt-1">
                                          {key}:
                                        </span>
                                        <div className="flex-1">
                                          <MaskedValue
                                            value={value}
                                            isRevealed={!isSensitive || isRevealed}
                                            onToggleReveal={isSensitive ? () => {
                                              setRevealedKeys(prev => {
                                                const next = new Set(prev);
                                                if (next.has(fullKey)) {
                                                  next.delete(fullKey);
                                                } else {
                                                  next.add(fullKey);
                                                }
                                                return next;
                                              });
                                            } : undefined}
                                            compact
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
```

**Step 2: Export from index.ts**

Add to `src/components/resources/index.ts`:
```tsx
export { VolumeMounts } from "./VolumeMounts";
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds (may need to add VolumeInfo/VolumeMountInfo types)

**Step 4: Commit**

```bash
git add src/components/resources/VolumeMounts.tsx src/components/resources/index.ts
git commit -m "feat(resources): add VolumeMounts component with expandable content"
```

---

## Task 11: Update EnvironmentVariables Component

**Files:**
- Modify: `src/components/resources/EnvironmentVariables.tsx`

**Step 1: Refactor to use new primitives and support EnvFrom expansion**

Update the component to:
- Use `SourceBadge` instead of inline badge logic
- Use `MaskedValue` for consistent masking
- Expand EnvFrom to show all imported variables
- Add filter dropdown

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/resources/EnvironmentVariables.tsx
git commit -m "refactor(env): use unified SourceBadge/MaskedValue, expand EnvFrom"
```

---

## Task 12: Create ImagePullSecrets Component

**Files:**
- Create: `src/components/resources/ImagePullSecrets.tsx`
- Modify: `src/components/resources/index.ts`

**Step 1: Create ImagePullSecrets component**

```tsx
// src/components/resources/ImagePullSecrets.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Image, Lock } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

interface ImagePullSecretsProps {
  secrets: string[];
  namespace?: string;
}

export function ImagePullSecrets({ secrets, namespace }: ImagePullSecretsProps) {
  const [isExpanded, setIsExpanded] = useState(secrets.length > 0);

  return (
    <Card>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-80">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <CardTitle className="text-base">
              Image Pull Secrets
              <Badge variant="secondary" className="ml-2">{secrets.length}</Badge>
            </CardTitle>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {secrets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No image pull secrets configured</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {secrets.map((secretName) => (
                  <Link
                    key={secretName}
                    to={namespace ? `/configuration/secrets/${namespace}/${secretName}` : "#"}
                    className="flex items-center gap-2 text-sm border rounded-md px-3 py-1.5 bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <Lock className="h-3 w-3 text-orange-500" />
                    <span className="font-mono text-xs">{secretName}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
```

**Step 2: Export from index.ts**

Add to `src/components/resources/index.ts`:
```tsx
export { ImagePullSecrets } from "./ImagePullSecrets";
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/resources/ImagePullSecrets.tsx src/components/resources/index.ts
git commit -m "feat(resources): add ImagePullSecrets component"
```

---

## Task 13: Create ContainerConfiguration Component

**Files:**
- Create: `src/components/resources/ContainerConfiguration.tsx`
- Modify: `src/components/resources/index.ts`

**Step 1: Create ContainerConfiguration component**

This component combines EnvironmentVariables, VolumeMounts, and ImagePullSecrets into a unified "Configuration" view.

```tsx
// src/components/resources/ContainerConfiguration.tsx
import { EnvironmentVariables } from "./EnvironmentVariables";
import { VolumeMounts } from "./VolumeMounts";
import { ImagePullSecrets } from "./ImagePullSecrets";
import type { EnvVarInfo, EnvFromInfo, VolumeInfo, VolumeMountInfo } from "@/generated/types";

interface ContainerConfigurationProps {
  env: EnvVarInfo[];
  envFrom: EnvFromInfo[];
  volumes: VolumeInfo[];
  volumeMounts: VolumeMountInfo[];
  imagePullSecrets: string[];
  containerName?: string;
  namespace?: string;
}

export function ContainerConfiguration({
  env,
  envFrom,
  volumes,
  volumeMounts,
  imagePullSecrets,
  containerName,
  namespace,
}: ContainerConfigurationProps) {
  return (
    <div className="space-y-4">
      <EnvironmentVariables
        env={env}
        envFrom={envFrom}
        containerName={containerName}
        namespace={namespace}
      />
      <VolumeMounts
        volumes={volumes}
        volumeMounts={volumeMounts}
        namespace={namespace}
      />
      <ImagePullSecrets
        secrets={imagePullSecrets}
        namespace={namespace}
      />
    </div>
  );
}
```

**Step 2: Export from index.ts**

Add to `src/components/resources/index.ts`:
```tsx
export { ContainerConfiguration } from "./ContainerConfiguration";
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/resources/ContainerConfiguration.tsx src/components/resources/index.ts
git commit -m "feat(resources): add ContainerConfiguration unified view component"
```

---

## Task 14: Update ContainerCard to Use ContainerConfiguration

**Files:**
- Modify: `src/components/resources/ContainerCard.tsx`

**Step 1: Read current ContainerCard implementation**

Review how environment variables are currently displayed.

**Step 2: Update to use ContainerConfiguration**

Replace the inline environment variables display with the new `ContainerConfiguration` component. Pass volumes and imagePullSecrets from the pod spec.

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/resources/ContainerCard.tsx
git commit -m "refactor(containers): use ContainerConfiguration for unified display"
```

---

## Task 15: Cleanup Old Components

**Files:**
- Delete or deprecate: `src/components/resources/SecretDataDialog.tsx`
- Delete or deprecate: `src/components/resources/ConfigMapDataDialog.tsx`
- Update: `src/components/resources/index.ts`

**Step 1: Check if dialogs are still used**

Search for usages of SecretDataDialog and ConfigMapDataDialog.

**Step 2: Remove unused components**

If no longer used, delete the files and remove exports from index.ts.

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused SecretDataDialog and ConfigMapDataDialog"
```

---

## Task 16: Final Build and Test

**Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds without errors

**Step 2: Run Tauri dev to test**

Run: `npm run tauri dev`
Expected: Application starts and shows updated UI

**Step 3: Manual testing checklist**

- [ ] Secret detail page shows Data tab with KeyValueList
- [ ] Secret detail page has "Referenced By" tab
- [ ] ConfigMap detail page shows Data tab with KeyValueList
- [ ] ConfigMap detail page has "Referenced By" tab
- [ ] Pod containers show EnvironmentVariables with EnvFrom expanded
- [ ] Pod containers show VolumeMounts with expandable content
- [ ] Pod containers show ImagePullSecrets
- [ ] SourceBadge links navigate to correct resources
- [ ] Secret values are masked by default
- [ ] Reveal/Hide toggle works correctly

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during testing"
```

---

## Summary

| Task | Component | Files Changed |
|------|-----------|---------------|
| 1 | SourceBadge | src/components/ui/source-badge.tsx |
| 2 | MaskedValue | src/components/ui/masked-value.tsx |
| 3 | ResourceLink | src/components/shared/resource-link.tsx |
| 4 | KeyValueList | src/components/shared/key-value-list.tsx |
| 5 | Backend API | src-tauri/src/commands/config_resources.rs |
| 6 | Types | src/generated/types.ts |
| 7 | ReferencedBy | src/components/resources/ReferencedBy.tsx |
| 8 | SecretDetail | src/pages/SecretDetail.tsx |
| 9 | ConfigMapDetail | src/pages/ConfigMapDetail.tsx |
| 10 | VolumeMounts | src/components/resources/VolumeMounts.tsx |
| 11 | EnvironmentVariables | src/components/resources/EnvironmentVariables.tsx |
| 12 | ImagePullSecrets | src/components/resources/ImagePullSecrets.tsx |
| 13 | ContainerConfiguration | src/components/resources/ContainerConfiguration.tsx |
| 14 | ContainerCard | src/components/resources/ContainerCard.tsx |
| 15 | Cleanup | Remove old dialogs |
| 16 | Final Test | Build and test |
