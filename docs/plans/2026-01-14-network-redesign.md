# Network Module Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix TLS display inconsistencies, improve port readability, add resource linking (Service→Pods, Ingress→Service), and better error handling in the Network module.

**Architecture:** Backend changes add `is_catch_all` flag to TLS configs and `has_catch_all_tls` to IngressInfo. New `get_pods_by_selector` command enables Service→Pods linking. Frontend creates reusable components in `src/components/network/` and updates existing list/detail pages.

**Tech Stack:** Rust (Tauri backend), TypeScript/React (frontend), TanStack Query, shadcn/ui components.

---

## Task 1: Backend - Add TLS Catch-All Flags

**Files:**
- Modify: `src-tauri/src/resources/network.rs:29-51`

**Step 1: Add is_catch_all to IngressTlsConfig**

In `src-tauri/src/resources/network.rs`, update the `IngressTlsConfig` struct:

```rust
/// Information about an Ingress TLS configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngressTlsConfig {
    pub hosts: Vec<String>,
    pub secret_name: Option<String>,
    pub is_catch_all: bool,
}
```

**Step 2: Add has_catch_all_tls to IngressInfo**

Update the `IngressInfo` struct:

```rust
/// Information about an Ingress
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngressInfo {
    pub name: String,
    pub namespace: String,
    pub class_name: Option<String>,
    pub rules: Vec<IngressRule>,
    pub load_balancer_ips: Vec<String>,
    pub tls_hosts: Vec<String>,
    pub tls_configs: Vec<IngressTlsConfig>,
    pub has_catch_all_tls: bool,
    pub labels: std::collections::BTreeMap<String, String>,
    pub annotations: std::collections::BTreeMap<String, String>,
    pub created_at: Option<String>,
}
```

**Step 3: Update the From implementation**

In the `From<&Ingress> for IngressInfo` implementation, update the TLS config parsing (around line 141-152):

```rust
        // Parse TLS configs with secret names
        let tls_configs: Vec<IngressTlsConfig> = spec
            .and_then(|s| s.tls.as_ref())
            .map(|tls_list| {
                tls_list
                    .iter()
                    .map(|tls| {
                        let hosts = tls.hosts.clone().unwrap_or_default();
                        let is_catch_all = hosts.is_empty();
                        IngressTlsConfig {
                            hosts,
                            secret_name: tls.secret_name.clone(),
                            is_catch_all,
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        let has_catch_all_tls = tls_configs.iter().any(|c| c.is_catch_all);
```

**Step 4: Update the Self return**

Add `has_catch_all_tls` to the returned struct:

```rust
        Self {
            name: ingress.name_any(),
            namespace: ingress.namespace().unwrap_or_default(),
            class_name: spec.and_then(|s| s.ingress_class_name.clone()),
            rules,
            load_balancer_ips,
            tls_hosts,
            tls_configs,
            has_catch_all_tls,
            labels,
            annotations,
            created_at: ingress
                .metadata
                .creation_timestamp
                .as_ref()
                .map(|t| t.0.to_rfc3339()),
        }
```

**Step 5: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compilation succeeds with no errors

**Step 6: Commit**

```bash
git add src-tauri/src/resources/network.rs
git commit -m "feat(network): add TLS catch-all flags to IngressInfo"
```

---

## Task 2: Backend - Add get_pods_by_selector Command

**Files:**
- Modify: `src-tauri/src/commands/workloads.rs` (add new command)
- Modify: `src-tauri/src/lib.rs` (register command)

**Step 1: Find workloads.rs location**

Run: `ls src-tauri/src/commands/`
Note the file structure for workload commands.

**Step 2: Add the get_pods_by_selector function**

Add to the workloads commands file:

```rust
#[tauri::command]
pub async fn get_pods_by_selector(
    namespace: String,
    selector: std::collections::BTreeMap<String, String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<crate::resources::workloads::PodInfo>, String> {
    let client = state.get_client().await.map_err(|e| e.to_string())?;

    // Convert selector map to label selector string
    let label_selector = selector
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join(",");

    let pods: kube::Api<k8s_openapi::api::core::v1::Pod> =
        kube::Api::namespaced(client, &namespace);

    let lp = kube::api::ListParams::default().labels(&label_selector);
    let pod_list = pods.list(&lp).await.map_err(|e| e.to_string())?;

    let pod_infos: Vec<crate::resources::workloads::PodInfo> = pod_list
        .items
        .iter()
        .map(|p| p.into())
        .collect();

    Ok(pod_infos)
}
```

**Step 3: Register the command in lib.rs**

Find the `invoke_handler` section and add `get_pods_by_selector` to the list.

**Step 4: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compilation succeeds

**Step 5: Commit**

```bash
git add src-tauri/src/commands/ src-tauri/src/lib.rs
git commit -m "feat(network): add get_pods_by_selector command for Service->Pods linking"
```

---

## Task 3: Regenerate TypeScript Types

**Files:**
- Modify: `src/generated/types.ts` (auto-generated)
- Modify: `src/generated/commands.ts` (auto-generated)

**Step 1: Run type generation**

Run: `npm run generate-types` (or the appropriate command for this project)

If no generate script exists, check `package.json` for the correct command or run:
```bash
cd src-tauri && cargo build
```

**Step 2: Verify types updated**

Check that `src/generated/types.ts` now contains:
- `IngressTlsConfig` with `isCatchAll: boolean`
- `IngressInfo` with `hasCatchAllTls: boolean`

**Step 3: Verify commands updated**

Check that `src/generated/commands.ts` contains the new `getPodsBySelector` function.

**Step 4: Commit**

```bash
git add src/generated/
git commit -m "chore: regenerate TypeScript types with TLS flags"
```

---

## Task 4: Create TlsBadge Component

**Files:**
- Create: `src/components/network/TlsBadge.tsx`
- Create: `src/components/network/index.ts`

**Step 1: Create the network components directory**

```bash
mkdir -p src/components/network
```

**Step 2: Create TlsBadge.tsx**

```tsx
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Shield } from "lucide-react";

interface TlsBadgeProps {
  tlsHosts: string[];
  hasCatchAllTls: boolean;
  showIcon?: boolean;
}

export function TlsBadge({ tlsHosts, hasCatchAllTls, showIcon = false }: TlsBadgeProps) {
  const explicitCount = tlsHosts.length;
  const hasTls = explicitCount > 0 || hasCatchAllTls;

  if (!hasTls) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        No TLS
      </Badge>
    );
  }

  // Build display text
  let displayText: string;
  if (explicitCount > 0 && hasCatchAllTls) {
    displayText = `TLS (${explicitCount} + all)`;
  } else if (hasCatchAllTls) {
    displayText = "TLS (all)";
  } else {
    displayText = `TLS (${explicitCount})`;
  }

  // Build tooltip content
  const tooltipLines: string[] = [];
  if (explicitCount > 0) {
    tooltipLines.push(...tlsHosts);
  }
  if (hasCatchAllTls) {
    tooltipLines.push("+ Catch-all TLS certificate");
  }

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge
          variant="default"
          className="bg-green-500/10 text-green-500 border-green-500/20"
        >
          {showIcon && <Shield className="h-3 w-3 mr-1" />}
          {displayText}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1">
          {tooltipLines.map((line, i) => (
            <div key={i} className="text-xs">
              {line}
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
```

**Step 3: Create index.ts**

```tsx
export { TlsBadge } from "./TlsBadge";
```

**Step 4: Verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/components/network/
git commit -m "feat(network): add TlsBadge component with catch-all support"
```

---

## Task 5: Update IngressList TLS Column

**Files:**
- Modify: `src/components/resources/IngressList.tsx:131-161`

**Step 1: Add TlsBadge import**

At the top of `IngressList.tsx`, add:

```tsx
import { TlsBadge } from "@/components/network";
```

**Step 2: Replace TLS column cell**

Replace the TLS column (around lines 131-161) with:

```tsx
  {
    accessorKey: "tlsHosts",
    header: "TLS",
    cell: ({ row }) => (
      <TlsBadge
        tlsHosts={row.original.tlsHosts}
        hasCatchAllTls={row.original.hasCatchAllTls}
      />
    ),
  },
```

**Step 3: Update getIngressOpenUrl for catch-all TLS**

Update the `getIngressOpenUrl` function (around lines 26-38):

```tsx
const getIngressOpenUrl = (ingress: IngressInfo): string | null => {
  const host =
    ingress.rules.find((rule) => rule.host && rule.host !== "*")?.host ||
    ingress.loadBalancerIps[0];

  if (!host) {
    return null;
  }

  // Check both explicit TLS hosts and catch-all TLS
  const usesTls = ingress.tlsHosts.includes(host) || ingress.hasCatchAllTls;
  const scheme = usesTls ? "https" : "http";
  return `${scheme}://${host}`;
};
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/components/resources/IngressList.tsx
git commit -m "feat(network): use TlsBadge in IngressList with catch-all support"
```

---

## Task 6: Update IngressDetail TLS Tab

**Files:**
- Modify: `src/pages/IngressDetail.tsx:282-328`

**Step 1: Add TlsBadge import**

Add at the top:

```tsx
import { TlsBadge } from "@/components/network";
```

**Step 2: Replace generateAccessUrls TLS logic**

Update the `generateAccessUrls` function (around lines 34-67) to use `hasCatchAllTls`:

```tsx
function generateAccessUrls(rules: IngressRule[], tlsHosts: string[], hasCatchAllTls: boolean): AccessUrl[] {
    const urls: AccessUrl[] = [];

    for (const rule of rules) {
        const isWildcard = rule.host === "*" || !rule.host;
        const displayHost = isWildcard ? "All hosts" : rule.host;
        const actualHost = isWildcard ? "" : rule.host;

        // TLS detection: host is in tlsHosts, or there's a catch-all TLS config
        const isHttps = tlsHosts.includes(rule.host) || hasCatchAllTls;
        const scheme = isHttps ? "https" : "http";
        const tlsReason = tlsHosts.includes(rule.host)
            ? "explicit"
            : hasCatchAllTls
                ? "catch-all"
                : null;

        for (const path of rule.paths) {
            const fullUrl = actualHost ? `${scheme}://${actualHost}${path.path}` : `${scheme}://<host>${path.path}`;
            urls.push({
                fullUrl,
                host: rule.host,
                displayHost,
                path: path.path,
                pathType: path.pathType,
                backendService: path.backendService,
                backendPort: path.backendPort,
                resourceBackend: path.resourceBackend,
                isHttps,
                tlsReason,
            });
        }
    }

    return urls;
}
```

**Step 3: Update AccessUrl interface**

Add `tlsReason` to the interface:

```tsx
interface AccessUrl {
    fullUrl: string;
    host: string;
    displayHost: string;
    path: string;
    pathType: string;
    backendService: string;
    backendPort: string;
    resourceBackend: string | null;
    isHttps: boolean;
    tlsReason: "explicit" | "catch-all" | null;
}
```

**Step 4: Update accessUrls call**

Update the call to pass `hasCatchAllTls`:

```tsx
const hasCatchAllTls = ingress?.hasCatchAllTls ?? false;
const accessUrls = generateAccessUrls(rules, tlsHosts, hasCatchAllTls);
```

**Step 5: Update TLS tab content**

Replace the TLS tab content (around lines 282-328) with improved version:

```tsx
        {
            id: "tls",
            label: "TLS",
            content: (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5" />
                            TLS Configuration
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {tlsConfigs.length > 0 ? (
                            <div className="space-y-4">
                                {/* Explicit TLS Hosts */}
                                {tlsConfigs.filter(c => !c.isCatchAll).length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-medium mb-2">Explicit TLS Hosts</h4>
                                        <div className="space-y-3">
                                            {tlsConfigs.filter(c => !c.isCatchAll).map((config, idx) => (
                                                <div key={idx} className="rounded-lg border p-4">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <Shield className="h-4 w-4 text-green-500" />
                                                        <span className="font-medium">
                                                            Secret: {config.secretName || "(auto-generated)"}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {config.hosts.map((host, hostIdx) => (
                                                            <Badge key={hostIdx} variant="outline" className="font-mono">
                                                                {host}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Catch-all TLS */}
                                {tlsConfigs.filter(c => c.isCatchAll).length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                            Catch-all TLS
                                        </h4>
                                        <div className="space-y-3">
                                            {tlsConfigs.filter(c => c.isCatchAll).map((config, idx) => (
                                                <div key={idx} className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Shield className="h-4 w-4 text-yellow-500" />
                                                        <span className="font-medium">
                                                            Secret: {config.secretName || "(auto-generated)"}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">
                                                        Applies to all hosts not explicitly listed above
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">No TLS configured</p>
                        )}
                    </CardContent>
                </Card>
            ),
        },
```

**Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add src/pages/IngressDetail.tsx
git commit -m "feat(network): improve IngressDetail TLS tab with explicit/catch-all sections"
```

---

## Task 7: Create ServiceTypeBadge Component

**Files:**
- Create: `src/components/network/ServiceTypeBadge.tsx`
- Modify: `src/components/network/index.ts`

**Step 1: Create ServiceTypeBadge.tsx**

```tsx
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ServiceTypeBadgeProps {
  type: string;
}

const typeConfig: Record<string, { color: string; description: string }> = {
  ClusterIP: {
    color: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    description: "Internal only - accessible within cluster",
  },
  NodePort: {
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    description: "External via node ports",
  },
  LoadBalancer: {
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    description: "External via load balancer",
  },
  ExternalName: {
    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    description: "DNS alias to external service",
  },
};

export function ServiceTypeBadge({ type }: ServiceTypeBadgeProps) {
  const config = typeConfig[type] || {
    color: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    description: "Unknown service type",
  };

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge variant="default" className={config.color}>
          {type}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{config.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
```

**Step 2: Update index.ts**

```tsx
export { TlsBadge } from "./TlsBadge";
export { ServiceTypeBadge } from "./ServiceTypeBadge";
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/network/
git commit -m "feat(network): add ServiceTypeBadge component with color coding"
```

---

## Task 8: Create PortsDisplay Component

**Files:**
- Create: `src/components/network/PortsDisplay.tsx`
- Modify: `src/components/network/index.ts`

**Step 1: Create PortsDisplay.tsx**

```tsx
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ServicePortInfo } from "@/generated/types";

interface PortsDisplayProps {
  ports: ServicePortInfo[];
  maxDisplay?: number;
}

function formatPortCompact(port: ServicePortInfo): string {
  let result = `${port.port}→${port.targetPort}`;
  if (port.nodePort) {
    result += ` (${port.nodePort})`;
  }
  return result;
}

function formatPortFull(port: ServicePortInfo): string {
  const parts = [`Port: ${port.port}`, `Target: ${port.targetPort}`];
  if (port.nodePort) {
    parts.push(`NodePort: ${port.nodePort}`);
  }
  parts.push(`Protocol: ${port.protocol}`);
  if (port.name) {
    parts.push(`Name: ${port.name}`);
  }
  return parts.join("\n");
}

export function PortsDisplay({ ports, maxDisplay = 2 }: PortsDisplayProps) {
  if (ports.length === 0) {
    return <span className="text-muted-foreground">No ports</span>;
  }

  const displayPorts = ports.slice(0, maxDisplay);
  const remainingCount = ports.length - maxDisplay;

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {displayPorts.map((port, idx) => (
        <Tooltip key={idx}>
          <TooltipTrigger>
            <Badge variant="secondary" className="text-xs font-mono">
              {formatPortCompact(port)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <pre className="text-xs whitespace-pre">{formatPortFull(port)}</pre>
          </TooltipContent>
        </Tooltip>
      ))}
      {remainingCount > 0 && (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className="text-xs">
              +{remainingCount}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-2">
              {ports.slice(maxDisplay).map((port, idx) => (
                <pre key={idx} className="text-xs whitespace-pre">
                  {formatPortFull(port)}
                </pre>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
```

**Step 2: Update index.ts**

```tsx
export { TlsBadge } from "./TlsBadge";
export { ServiceTypeBadge } from "./ServiceTypeBadge";
export { PortsDisplay } from "./PortsDisplay";
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/network/
git commit -m "feat(network): add PortsDisplay component with compact format"
```

---

## Task 9: Update ServiceList with New Components

**Files:**
- Modify: `src/components/resources/ServiceList.tsx`

**Step 1: Add imports**

```tsx
import { ServiceTypeBadge, PortsDisplay } from "@/components/network";
```

**Step 2: Remove old formatPort function**

Delete the `formatPort` function (around lines 24-34).

**Step 3: Update type column**

Replace the type column cell with:

```tsx
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => <ServiceTypeBadge type={row.original.type} />,
  },
```

**Step 4: Update ports column**

Replace the ports column cell with:

```tsx
  {
    accessorKey: "ports",
    header: "Ports",
    cell: ({ row }) => <PortsDisplay ports={row.original.ports} maxDisplay={2} />,
  },
```

**Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/components/resources/ServiceList.tsx
git commit -m "feat(network): use ServiceTypeBadge and PortsDisplay in ServiceList"
```

---

## Task 10: Create ServiceAccessInfo Component

**Files:**
- Create: `src/components/network/ServiceAccessInfo.tsx`
- Modify: `src/components/network/index.ts`

**Step 1: Create ServiceAccessInfo.tsx**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Copy, ExternalLink } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import type { ServiceInfo } from "@/generated/types";

interface ServiceAccessInfoProps {
  service: ServiceInfo;
}

export function ServiceAccessInfo({ service }: ServiceAccessInfoProps) {
  const copyToClipboard = useCopyToClipboard();

  const internalDns = `${service.name}.${service.namespace}.svc.cluster.local`;
  const shortDns = `${service.name}`;

  // Build access URLs based on service type
  const accessItems: Array<{
    label: string;
    url: string;
    canOpen: boolean;
    description: string;
  }> = [];

  if (service.type === "LoadBalancer" && service.externalIps.length > 0) {
    const port = service.ports[0]?.port;
    const url = `http://${service.externalIps[0]}${port && port !== 80 ? `:${port}` : ""}`;
    accessItems.push({
      label: "External (LoadBalancer)",
      url,
      canOpen: true,
      description: "Access via load balancer IP",
    });
  }

  if (service.type === "NodePort" && service.ports.some(p => p.nodePort)) {
    const nodePort = service.ports.find(p => p.nodePort)?.nodePort;
    accessItems.push({
      label: "External (NodePort)",
      url: `<any-node-ip>:${nodePort}`,
      canOpen: false,
      description: "Access via any cluster node IP",
    });
  }

  if (service.type === "ExternalName") {
    accessItems.push({
      label: "External Name",
      url: service.clusterIp || "N/A",
      canOpen: false,
      description: "DNS alias to external service",
    });
  }

  // Internal access for all types except ExternalName
  if (service.type !== "ExternalName") {
    const port = service.ports[0]?.port;
    accessItems.push({
      label: "Internal (full DNS)",
      url: `${internalDns}${port ? `:${port}` : ""}`,
      canOpen: false,
      description: "From any namespace in cluster",
    });
    accessItems.push({
      label: "Internal (short)",
      url: `${shortDns}${port ? `:${port}` : ""}`,
      canOpen: false,
      description: "From same namespace only",
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          How to Access This Service
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {accessItems.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg border p-3 bg-muted/30"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                <code className="text-sm font-mono text-muted-foreground break-all">
                  {item.url}
                </code>
                <p className="text-xs text-muted-foreground mt-1">
                  {item.description}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(item.url)}
                  title="Copy"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                {item.canOpen && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(item.url, "_blank", "noreferrer")}
                    title="Open in Browser"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {service.type === "ClusterIP" && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50 border">
            <p className="text-sm text-muted-foreground">
              <strong>ClusterIP</strong> services are only accessible from within the cluster.
              Use port-forward for local development:
              <code className="ml-1 text-xs bg-muted px-1 rounded">
                kubectl port-forward svc/{service.name} {service.ports[0]?.port || 8080}:{service.ports[0]?.port || 8080}
              </code>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Update index.ts**

```tsx
export { TlsBadge } from "./TlsBadge";
export { ServiceTypeBadge } from "./ServiceTypeBadge";
export { PortsDisplay } from "./PortsDisplay";
export { ServiceAccessInfo } from "./ServiceAccessInfo";
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/network/
git commit -m "feat(network): add ServiceAccessInfo component with access URLs"
```

---

## Task 11: Create MatchingPods Component

**Files:**
- Create: `src/components/network/MatchingPods.tsx`
- Modify: `src/components/network/index.ts`

**Step 1: Create MatchingPods.tsx**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { Users, Circle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { commands } from "@/lib/commands";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import { ResourceType } from "@/lib/resource-registry";
import type { PodInfo } from "@/generated/types";

interface MatchingPodsProps {
  namespace: string;
  selector: Record<string, string>;
}

function getPodStatusColor(phase: string): string {
  switch (phase) {
    case "Running":
      return "text-green-500";
    case "Pending":
      return "text-yellow-500";
    case "Succeeded":
      return "text-blue-500";
    case "Failed":
      return "text-red-500";
    default:
      return "text-gray-500";
  }
}

export function MatchingPods({ namespace, selector }: MatchingPodsProps) {
  const { data: pods, isLoading, error } = useQuery({
    queryKey: ["pods-by-selector", namespace, selector],
    queryFn: () => commands.getPodsBySelector(namespace, selector),
    enabled: Object.keys(selector).length > 0,
  });

  if (Object.keys(selector).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Matching Pods
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No selector defined</p>
        </CardContent>
      </Card>
    );
  }

  // Count pods by status
  const statusCounts = pods?.reduce((acc, pod) => {
    const phase = pod.phase || "Unknown";
    acc[phase] = (acc[phase] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const statusSummary = Object.entries(statusCounts)
    .map(([phase, count]) => `${count} ${phase.toLowerCase()}`)
    .join(", ");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Matching Pods
          {pods && pods.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {statusSummary}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <p className="text-destructive">Failed to load pods: {String(error)}</p>
        ) : pods && pods.length > 0 ? (
          <div className="space-y-2">
            {pods.map((pod) => (
              <Link
                key={pod.uid}
                to={getResourceDetailUrl(ResourceType.Pod, pod.name, pod.namespace)}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Circle
                    className={`h-3 w-3 fill-current ${getPodStatusColor(pod.phase || "Unknown")}`}
                  />
                  <span className="font-medium">{pod.name}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{pod.phase}</span>
                  {pod.podIp && <code className="font-mono text-xs">{pod.podIp}</code>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No pods match this selector</p>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Update index.ts**

```tsx
export { TlsBadge } from "./TlsBadge";
export { ServiceTypeBadge } from "./ServiceTypeBadge";
export { PortsDisplay } from "./PortsDisplay";
export { ServiceAccessInfo } from "./ServiceAccessInfo";
export { MatchingPods } from "./MatchingPods";
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds (or type errors if getPodsBySelector not yet generated)

**Step 4: Commit**

```bash
git add src/components/network/
git commit -m "feat(network): add MatchingPods component for Service->Pods linking"
```

---

## Task 12: Update ServiceDetail with New Components

**Files:**
- Modify: `src/pages/ServiceDetail.tsx`

**Step 1: Add imports**

```tsx
import { ServiceAccessInfo, MatchingPods, ServiceTypeBadge } from "@/components/network";
```

**Step 2: Add ServiceAccessInfo to the detail view**

In the tabs array, add a new "Access" tab at the beginning:

```tsx
    {
      id: "access",
      label: "Access",
      content: service ? <ServiceAccessInfo service={service} /> : null,
    },
```

**Step 3: Add MatchingPods tab**

Add a new "Pods" tab:

```tsx
    {
      id: "pods",
      label: "Pods",
      content: service ? (
        <MatchingPods
          namespace={service.namespace}
          selector={service.selector}
        />
      ) : null,
    },
```

**Step 4: Update default tab**

Change `defaultTab` from existing value to `"access"`.

**Step 5: Use ServiceTypeBadge in badges section**

In the badges prop, replace the type badge with:

```tsx
{service?.type && <ServiceTypeBadge type={service.type} />}
```

**Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add src/pages/ServiceDetail.tsx
git commit -m "feat(network): add Access and Pods tabs to ServiceDetail"
```

---

## Task 13: Create LinkedResource Component

**Files:**
- Create: `src/components/network/LinkedResource.tsx`
- Modify: `src/components/network/index.ts`

**Step 1: Create LinkedResource.tsx**

```tsx
import { Link } from "react-router-dom";
import { ExternalLink, AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import { ResourceType } from "@/lib/resource-registry";

interface LinkedResourceProps {
  resourceType: ResourceType;
  name: string;
  namespace: string;
  port?: string;
  exists?: boolean;
  className?: string;
}

export function LinkedResource({
  resourceType,
  name,
  namespace,
  port,
  exists = true,
  className = "",
}: LinkedResourceProps) {
  const displayText = port ? `${name}:${port}` : name;
  const url = getResourceDetailUrl(resourceType, name, namespace);

  if (!exists) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <span className={`text-destructive flex items-center gap-1 ${className}`}>
            <AlertTriangle className="h-3 w-3" />
            {displayText}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Resource not found in cluster</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={url}
          className={`text-primary hover:underline flex items-center gap-1 ${className}`}
        >
          {displayText}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">View {resourceType} details</p>
      </TooltipContent>
    </Tooltip>
  );
}
```

**Step 2: Update index.ts**

```tsx
export { TlsBadge } from "./TlsBadge";
export { ServiceTypeBadge } from "./ServiceTypeBadge";
export { PortsDisplay } from "./PortsDisplay";
export { ServiceAccessInfo } from "./ServiceAccessInfo";
export { MatchingPods } from "./MatchingPods";
export { LinkedResource } from "./LinkedResource";
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/network/
git commit -m "feat(network): add LinkedResource component for cross-resource navigation"
```

---

## Task 14: Update IngressDetail with LinkedResource

**Files:**
- Modify: `src/pages/IngressDetail.tsx`

**Step 1: Add LinkedResource import**

```tsx
import { TlsBadge, LinkedResource } from "@/components/network";
```

**Step 2: Update Access URLs to use LinkedResource**

In the Access tab content, update the backend display (around line 166-173):

```tsx
<span className="text-sm text-muted-foreground shrink-0">
    {url.resourceBackend ? (
        `Resource: ${url.resourceBackend}`
    ) : url.backendService ? (
        <LinkedResource
            resourceType={ResourceType.Service}
            name={url.backendService}
            namespace={ingress?.namespace || ""}
            port={url.backendPort}
        />
    ) : (
        "No backend"
    )}
</span>
```

**Step 3: Update Rules tab backend display**

In the Rules tab (around line 260-267):

```tsx
<div className="text-sm text-muted-foreground">
    → {path.resourceBackend ? (
        `Resource: ${path.resourceBackend}`
    ) : path.backendService ? (
        <LinkedResource
            resourceType={ResourceType.Service}
            name={path.backendService}
            namespace={ingress?.namespace || ""}
            port={path.backendPort}
        />
    ) : (
        "No backend"
    )}
</div>
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/pages/IngressDetail.tsx
git commit -m "feat(network): add clickable service links in IngressDetail"
```

---

## Task 15: Update EndpointsDetail with Service Link

**Files:**
- Modify: `src/pages/EndpointsDetail.tsx`

**Step 1: Add LinkedResource import**

```tsx
import { LinkedResource } from "@/components/network";
```

**Step 2: Add Service link in header**

In the badges section, add a link to the parent Service:

```tsx
badges={
    <>
        {endpoints?.namespace && (
            <Badge variant="outline">{endpoints.namespace}</Badge>
        )}
        <LinkedResource
            resourceType={ResourceType.Service}
            name={endpoints?.name || name || ""}
            namespace={endpoints?.namespace || namespace || ""}
        />
    </>
}
```

**Step 3: Update pod references to be clickable**

In the addresses display, make targetRef clickable:

```tsx
{addr.targetRef && addr.targetRef.kind === "Pod" && (
    <LinkedResource
        resourceType={ResourceType.Pod}
        name={addr.targetRef.name}
        namespace={addr.targetRef.namespace || endpoints?.namespace || ""}
        className="text-xs"
    />
)}
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/pages/EndpointsDetail.tsx
git commit -m "feat(network): add Service and Pod links in EndpointsDetail"
```

---

## Task 16: Add Error Handling to Events

**Files:**
- Modify: `src/pages/IngressDetail.tsx:404-448`

**Step 1: Update events query to expose error**

```tsx
const { data: events = [], isLoading: eventsLoading, error: eventsError, refetch: refetchEvents } = useQuery({
    // ... existing config
});
```

**Step 2: Update Events tab content**

Replace the Events tab content with:

```tsx
{
    id: "events",
    label: "Events",
    content: (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Events
                </CardTitle>
            </CardHeader>
            <CardContent>
                {eventsError ? (
                    <div className="flex items-center justify-between p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            <span className="text-sm">Failed to load events</span>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => refetchEvents()}>
                            Retry
                        </Button>
                    </div>
                ) : eventsLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                ) : events.length > 0 ? (
                    <div className="space-y-3">
                        {events.map((event: EventInfo) => {
                            const isWarning = event.type === "Warning";
                            return (
                                <div
                                    key={event.uid}
                                    className={cn(
                                        "rounded-lg border p-3",
                                        isWarning ? "border-yellow-500/50 bg-yellow-500/5" : "border-border"
                                    )}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2">
                                            {isWarning ? (
                                                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                            ) : (
                                                <Info className="h-4 w-4 text-blue-500" />
                                            )}
                                            <span className="font-medium">{event.reason}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Clock className="h-3 w-3" />
                                            {event.lastTimestamp
                                                ? new Date(event.lastTimestamp).toLocaleString()
                                                : "Unknown"}
                                            {(event.count || 0) > 1 && (
                                                <Badge variant="secondary" className="ml-2">
                                                    x{event.count}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">{event.message}</p>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-muted-foreground">No events found</p>
                )}
            </CardContent>
        </Card>
    ),
},
```

**Step 3: Add Skeleton import if missing**

```tsx
import { Skeleton } from "@/components/ui/skeleton";
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/pages/IngressDetail.tsx
git commit -m "feat(network): add error handling and retry to Events tab"
```

---

## Task 17: Final Verification and Cleanup

**Step 1: Run full build**

```bash
npm run build
```

Expected: Build succeeds with no errors

**Step 2: Run Rust check**

```bash
cd src-tauri && cargo check
```

Expected: Compiles with no errors (warnings OK)

**Step 3: Verify all new components export**

Check `src/components/network/index.ts` exports all:
- TlsBadge
- ServiceTypeBadge
- PortsDisplay
- ServiceAccessInfo
- MatchingPods
- LinkedResource

**Step 4: Create final commit**

```bash
git add -A
git status
```

If any uncommitted changes:

```bash
git commit -m "chore(network): cleanup and final verification"
```

**Step 5: Push branch**

```bash
git push -u origin feature/network-redesign
```

---

## Summary

| Task | Component | Description |
|------|-----------|-------------|
| 1 | Backend | Add TLS catch-all flags |
| 2 | Backend | Add get_pods_by_selector command |
| 3 | Types | Regenerate TypeScript types |
| 4 | TlsBadge | Reusable TLS badge with catch-all |
| 5 | IngressList | Use TlsBadge, fix TLS detection |
| 6 | IngressDetail | Improve TLS tab sections |
| 7 | ServiceTypeBadge | Color-coded service types |
| 8 | PortsDisplay | Compact port format |
| 9 | ServiceList | Use new components |
| 10 | ServiceAccessInfo | "How to Access" card |
| 11 | MatchingPods | Service→Pods linking |
| 12 | ServiceDetail | Add Access/Pods tabs |
| 13 | LinkedResource | Cross-resource navigation |
| 14 | IngressDetail | Clickable backend services |
| 15 | EndpointsDetail | Service/Pod links |
| 16 | Events | Error handling with retry |
| 17 | Verification | Final build and push |
