# UX Improvements Plan

## Overview

Plan for improving UX in k8s-gui to make the interface intuitive for beginners while not slowing down experienced users.

**Target audience:** Both K8s beginners and experienced DevOps/SRE
**Approach:** Progressive disclosure — simple by default, power features available

---

## Priority Matrix

| # | Improvement | Impact | Effort | Priority |
|---|-------------|--------|--------|----------|
| 1 | Clickable Ports | High | Low (2-3h) | **P0** |
| 2 | Unified Actions System | High | Medium (4-5h) | **P0** |
| 3 | Keyboard Shortcuts | Medium | Low (2-3h) | **P1** |
| 4 | Related Resources | Medium | Medium (6-8h) | **P1** |
| 5 | Breadcrumbs & Navigation | Medium | Low (3-4h) | **P2** |
| 6 | Information Density | Medium | Low (4-5h) | **P2** |
| 7 | Enhanced Command Palette | Low | Medium (4-5h) | **P3** |

**Total estimated effort:** ~26-33 hours

---

## P0: Critical Improvements

### 1. Clickable Ports

**Problem:**
To set up port-forward, user must: remember port number → find "Port Forward" button → open dialog → manually enter port. Too many steps for a frequent action.

**Solution:**
Create `ClickablePort` component. Click on any port → opens Port Forward dialog with pre-filled fields.

**Pre-filled values:**
- Pod name (from context)
- Remote port (clicked port)
- Local port (same as remote by default)
- Name (auto-generated: "pod-name:port")

**Where to apply:**
- `ContainerCard` — container ports
- `ServiceDetail` — service ports (targetPort → pod)
- `ServiceList` — ports in table
- `PodDetail` — all port displays

**Files to modify:**
- Create: `src/components/ui/clickable-port.tsx`
- Modify: `src/components/resources/ContainerCard.tsx`
- Modify: `src/pages/ServiceDetail.tsx`
- Modify: `src/components/resources/ServiceList.tsx`
- Modify: `src/pages/PodDetail.tsx`

---

### 2. Unified Actions System

**Problem:**
Current state has visual and UX issues:
- Quick actions on hover overlap content (Age column)
- Duplication: both hover actions AND ActionMenu (three dots)
- Inconsistent patterns across different lists

**Solution:**
Dedicated "Actions" column on the right side of tables:
- Fixed width column
- Actions visible on row hover (within their own space)
- Remove ActionMenu (three dots) — no duplication
- No content overlap

**Context-specific actions:**

| Resource | Actions |
|----------|---------|
| Pod | Port Forward, Logs, Terminal, Delete |
| Deployment | Scale, Restart, Delete |
| Service | Port Forward (to first pod), Delete |
| StatefulSet | Scale, Delete |
| Job | Logs (last pod), Delete |
| CronJob | Trigger, Delete |

**Files to modify:**
- Modify: `src/components/ui/data-table.tsx`
- Modify: `src/components/ui/quick-actions.tsx`
- Remove ActionMenu from: `ServiceList.tsx`, `PodList.tsx`, `DeploymentList.tsx`, etc.

---

## P1: Important Improvements

### 3. Keyboard Shortcuts

**Problem:**
Experienced users want to do everything from keyboard. Currently only `Cmd+K` and arrow navigation exist.

**Solution:**
Add hotkeys when table row is focused:

| Key | Action | Context |
|-----|--------|---------|
| `L` | Open Logs | Pod, Job |
| `T` | Open Terminal | Pod |
| `P` | Port Forward dialog | Pod, Service |
| `S` | Scale dialog | Deployment, StatefulSet |
| `D` / `Delete` | Delete (with confirmation) | All resources |
| `E` | Edit YAML | All resources |
| `R` | Restart/Rollout | Deployment, DaemonSet |

**UI hint in table footer:**
```
↑↓ Navigate • Enter Open • L Logs • T Terminal • P Port Forward
```

**Files to modify:**
- Modify: `src/hooks/useTableKeyboardNav.ts`
- Modify: `src/components/ui/data-table.tsx`

---

### 4. Related Resources

**Problem:**
User sees a Pod but doesn't understand context: which Deployment created it? Which Service points to it? Manual search by labels/selectors required.

**Solution:**
Add "Related Resources" section on detail pages:

**PodDetail:**
```
Related Resources
├── Owner: Deployment/nginx-deployment (clickable)
├── Services: service/nginx-svc (clickable)
├── Ingress: ingress/nginx-ingress (clickable)
└── ConfigMaps: configmap/nginx-config (mounted)
```

**ServiceDetail:**
```
Related Resources
├── Pods: 3 matching pods (clickable → filtered list)
├── Ingress: ingress/api-ingress
└── Endpoints: 3 active endpoints
```

**DeploymentDetail:**
```
Related Resources
├── ReplicaSet: rs/nginx-5d4c7b8f9
├── Services: service/nginx-svc (by selector match)
└── HPA: hpa/nginx-autoscaler (if exists)
```

**Implementation:** Use ownerReferences + label selectors matching on backend.

**Files to modify:**
- Create: `src/components/resources/RelatedResources.tsx`
- Create: `src-tauri/src/commands/related_resources.rs`
- Modify: `src/pages/PodDetail.tsx`
- Modify: `src/pages/ServiceDetail.tsx`
- Modify: `src/pages/DeploymentDetail.tsx`

---

## P2: Nice-to-Have Improvements

### 5. Breadcrumbs & Navigation

**Problem:**
Deep navigation loses context. User opens Pod from Deployment — how to return? Only browser back button available.

**Solution:**

**Breadcrumbs:**
```
Deployments / default / nginx-deployment / Pods / nginx-pod-abc123
```
Each segment is clickable.

**Quick Back:**
```
← Back to nginx-deployment
```
Show where user came from.

**Recent Resources (in sidebar or Command Palette):**
```
Recently Viewed
├── Pod/nginx-abc123 (2 min ago)
├── Deployment/nginx-deployment (5 min ago)
└── Service/api-gateway (10 min ago)
```

**Files to modify:**
- Create: `src/components/layout/Breadcrumbs.tsx`
- Create: `src/stores/navigationHistoryStore.ts`
- Modify: `src/components/layout/` components

---

### 6. Information Density

**Problem:**
Some pages are overloaded, others too empty. Beginners get lost, experienced users want more data immediately.

**Solution:**

**Compact mode toggle:**
- "Compact / Comfortable" toggle in table header
- Compact: less padding, smaller font, more rows per screen
- Persist user preference

**Collapsible sections on detail pages:**
```
▼ Metadata (expanded by default)
▶ Conditions (collapsed — 3 items)
▶ Events (collapsed — 12 items)
▶ Raw YAML (collapsed)
```

**Status summary at top:**
```
┌─────────────────────────────────────────┐
│ ● Ready  │ 3/3 Pods │ Age: 2d │ CPU: 12% │
└─────────────────────────────────────────┘
```

**Files to modify:**
- Create: `src/components/ui/collapsible-section.tsx`
- Create: `src/stores/uiPreferencesStore.ts`
- Modify: `src/components/ui/data-table.tsx`
- Modify: detail pages

---

## P3: Future Improvements

### 7. Enhanced Command Palette

**Problem:**
Command Palette (`Cmd+K`) is navigation-only. Missed opportunity.

**Solution:**

**Resource search:**
```
> pod nginx
  ├── Pod/nginx-abc123 (default) — Running
  ├── Pod/nginx-def456 (staging) — Running
  └── Pod/nginx-old (default) — Failed
```

**Quick actions:**
```
> scale nginx
  └── Scale Deployment/nginx-deployment...

> logs api
  └── View logs for Pod/api-server-xyz...
```

**Commands:**
```
> /restart deployment nginx
> /delete pod nginx-abc123
> /logs -f pod/api-server
```

**Fuzzy search:** Find even with typos — "nghix" → "nginx"

**Files to modify:**
- Modify: `src/components/CommandPalette.tsx`
- Create: `src/lib/fuzzy-search.ts`
- Create backend endpoints for resource search

---

## Implementation Order

Recommended order based on dependencies and quick wins:

1. **Unified Actions System** (P0) — fixes current bug with overlap
2. **Clickable Ports** (P0) — high value, low effort
3. **Keyboard Shortcuts** (P1) — builds on unified actions
4. **Breadcrumbs & Navigation** (P2) — improves overall UX
5. **Information Density** (P2) — polish
6. **Related Resources** (P1) — requires backend work
7. **Enhanced Command Palette** (P3) — future enhancement

---

## Success Metrics

- Reduced clicks for common actions (port forward, logs, terminal)
- No visual overlaps or UI bugs
- Consistent action patterns across all resource types
- Keyboard-navigable for power users
- Clear navigation context at all times
