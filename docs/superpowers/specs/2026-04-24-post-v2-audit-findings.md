# Post-v2.0.0 Audit — Consolidated Findings

**Date:** 2026-04-24
**Scope:** 10 parallel audit agents covered bugs (Rust + frontend), architecture, unification, UI/UX, tests, infrastructure, security, performance, documentation, plus a dead-code sweep.

This is a roadmap, not a plan. Items are grouped by priority; each tagged with source audit and rough effort.

---

## 🔴 CRITICAL — address before 2.0.1

### Code bugs with user-visible impact

| Item | Source | File | Effort |
|---|---|---|---|
| Conditional `useMemo` in 3 detail pages (real `rules-of-hooks` violation) | Frontend bugs | `StatefulSetDetail.tsx:78`, `DaemonSetDetail.tsx:77`, `JobDetail.tsx:88` | 30min |
| Variable hoisting in pointer-event cleanup | Frontend bugs | `InfrastructureBuilder.tsx:227` | 30min |
| Dynamic React component inside JSX IIFE (loses state each render) | Frontend bugs | `NodeDetail.tsx:175` | 15min |
| Stale closure in `InspectorPanel` effect (reads `node.data.*` but only depends on `node.id`) | Frontend bugs | `InspectorPanel.tsx:330` | 15min |
| Unchecked `parts[0]/parts[1]` after `splitn` — can panic on bad user input | Rust bugs | `commands/manifest.rs:143` | 15min |
| `.unwrap()` in production auth paths for exec-args parsing | Rust bugs | `auth/azure_aks.rs:286`, `auth/gcp_gke.rs:212` | 30min |
| Orphaned `tokio::spawn` for log streams + port-forward inner tasks (resource leak on panic) | Rust bugs | `commands/logs.rs:77`, `commands/port_forward.rs:292` | 1-2h |

### Infrastructure gates

| Item | Source | Effort |
|---|---|---|
| CI doesn't run `cargo test`, `cargo fmt --check`, `cargo clippy`, `npm run lint` — PRs can merge broken | Infra | 30min (one new job) |
| Release workflow leaves draft unpublished — users can't auto-update without manual `gh release publish` | Infra | 5min (flag flip or follow-up job) |

### Security

| Item | Source | Effort |
|---|---|---|
| `"csp": null` in `tauri.conf.json` — malicious K8s response with XSS in logs/manifests could execute | Security | 30min (set + test) |

---

## 🟡 HIGH — 2.0.x roadmap (weeks)

### Unification (biggest ROI for future development)

1. **Rust `#[generate_resource_commands!]` macro** — eliminates 4 near-identical list/get/delete/yaml commands per resource. ~70 LOC saved per resource type. 10-14h, medium risk. (Unification agent)
2. **Frontend `createResourceListComponent<T>()` factory** — collapses 15 list pages, each ~180 LOC of boilerplate around `useResourceList + columns + QuickActions`. 8-12h, medium risk. (Unification + Architecture agents)
3. **Resource detail page template** — 15 detail pages share tabs (Overview/YAML/Events) structure. 6-10h. (Unification)

### Architecture debt worth paying down

4. **Split monolithic pages**: `InfrastructureBuilder.tsx` (1222 LOC), `Helm.tsx` (1037), `InspectorPanel.tsx` (1015), `PodDetail.tsx` (833). Extract sub-components + state hooks. (Architecture)
5. **`logs/mod.rs` (910 LOC) split** into `logs/parser.rs` / `logs/stream.rs` / `logs/cache.rs`. (Architecture)
6. **Tauri command facade** — 167 flat functions in `src/generated/commands.ts` → group as `commands.pods.list()`, `commands.helm.upgrade()`, etc. (Architecture)

### Runtime correctness

7. **Kubeconfig TOCTOU race** in `client/mod.rs:47` — file can change between read and cache. (Rust bugs)
8. **Silent event-channel drops** — `let _ = self.event_tx.send(event)` at `state.rs:230`. Add warn-level log when channel full. (Rust bugs)
9. **Port-forward cleanup ABA race** — generation counter needed. (Rust bugs)
10. **Async lock held across `.await`** in `terminal/manager.rs:88` — blocks readers. (Rust bugs)

### Performance wins (user-visible)

11. **Replace 2-second polling in every list with K8s-watch + Tauri event broadcast** — 60-80% fewer Tauri calls idle. Single biggest CPU/battery win. (Performance)
12. **Lazy-load CodeMirror + xterm** — ~140 KB gzip off initial bundle. 1-2h. (Performance)
13. **Zustand selectors in `Header.tsx`** — entire store destructured, causes 40% extra header re-renders. (Performance)
14. **Virtualize `DataTable` by default for >100 rows** — infra already exists (`enableVirtualScroll`), just flip default. (Performance)
15. **Batch log-stream events** — Rust side emits per-line, should batch 10-20. (Performance)

---

## 🟢 MEDIUM — when there's bandwidth

### UX polish

16. **Empty states need CTAs** — `No results.` in `data-table.tsx:364` → add contextual action (Create pod, Change namespace). (UX)
17. **Persist list filter/search in URL** — currently lost on navigation. (UX)
18. **Log viewer scrollback indicator** — user has no idea if old logs got pruned. (UX)
19. **YAML editor live validation** — currently only on Apply. (UX)
20. **Sidebar expansion state not persisted.** (UX)
21. **Port-forward "Reconnecting" has no visual progress.** (UX)

### Test infrastructure

22. **Add `cargo test` CI job** (now + always gate merges). (Tests — also overlap with Infra 🔴)
23. **Add Vitest + test frontend stores and lib/ utilities** (`k8s-quantity`, `metrics-utils`, `navigation-utils`). (Tests)
24. **Unit-test critical Rust modules** that currently have 0 coverage: `auth/aws_eks.rs`, `logs/mod.rs`, `cli/tool.rs`, `terminal/adapters/pod_exec.rs`, `commands/port_forward.rs`. (Tests)
25. **Add `cargo-tarpaulin` for coverage visibility.** (Tests)

### Infra quick wins (~2h total)

26. `.editorconfig` (5 min). (Infra)
27. `.vscode/settings.json` + `extensions.json` (10 min). (Infra)
28. `make lint|fmt|fmt-check|clippy` targets in Makefile (10 min). (Infra)
29. `lefthook.yml` pre-commit hooks (20 min). (Infra)
30. Docker layer cache in Linux build (15 min, ~30-60s per run saved). (Infra)

### Security hardening (defense-in-depth)

31. `canonicalize()` kubeconfig path before loading (block symlink escapes). (Security)
32. Wrap bearer tokens in `secrecy::SecretString` (zero on drop, doesn't print). (Security)

### Documentation

33. **`ARCHITECTURE.md`** (2-3h) — data-flow diagram + directory map. (Docs)
34. **`ADDING_A_RESOURCE.md`** (2-3h) — step-by-step for new K8s resource. Unblocks contribution. (Docs)
35. **`DEVELOPER_SETUP.md`** (1-2h) — kind/minikube, kubeconfig, env vars, debug logging. (Docs)
36. **README screenshots** + expand feature bullets with one-liners. (Docs)
37. Fix React 18 → 19 reference in README and CONTRIBUTING.md. (Docs, 2min)

### Stylistic frontend cleanup (post-react-hooks@7)

38. ~40 `setState-in-effect` warnings — per-case review, most safe but noisy. (Frontend bugs)
39. ~8 missing error-cause chains (`throw new Error(msg, { cause })`). (Frontend bugs)

---

## 🔵 LOW — nice-to-have

- **Dead code removal:** `Dockerfile.linux-build`, `src/hooks/index.ts`, `src/hooks/useClusterInfo.ts`, `src/hooks/useDebugOperation.ts`.
- **Rust `[profile.release]`**: `lto = true`, `codegen-units = 1`, `strip = true`, `opt-level = "z"` — 10-15% binary size. (Performance)
- **Zustand persisted-store factory** — remove persist boilerplate duplication. (Unification)
- **Dialog form factory** (`useDialogForm`) — 20+ dialogs share a pattern. (Unification)
- **CodeQL workflow** — free static security scan. (Security/Infra)
- **Dependabot** — auto-PR for deps. (Infra)
- **CODEOWNERS** — routes PRs when team scales. (Infra)
- **Link-checker workflow** for `*.md`. (Infra)
- **Branch protection rules** (GitHub UI). (Infra)
- **CHANGELOG section headers** + auto-generate from commits. (Infra)
- **`USAGE.md`** end-user guide with screenshots. (Docs)
- **`state.rs` pub-sub pattern docs.** (Docs)
- **i18n infrastructure** — explicit non-goal for 2.x, note in docs. (Docs)
- **`Dockerfile.linux-build`**: confirm dead and remove. (Infra)

---

## ✅ What the project gets RIGHT (don't break these)

- **Clean layering:** Frontend `hooks → commands → backend`; `useResource` consistently used across 20+ pages. (Architecture)
- **Centralized error handling:** `src-tauri/src/error.rs` typed enum + `src/lib/error-utils.ts` `normalizeTauriError` used everywhere. (Architecture)
- **Focused Zustand stores** with no god object. (Architecture)
- **Command safety:** all shell spawns via `.arg()`, no string interpolation. **Zero `unsafe` in Rust code.** TLS verify on by default. Minisign-signed releases with verified updater. (Security)
- **UX fundamentals:** skeleton loading states (not spinners), density toggle, keyboard navigation in tables, typed-text-to-confirm destructive dialogs, deduped toasts. (UX)
- **Rust test coverage in the modules that have it:** 113 unit + 6 doctest pass, well-structured. (Tests)
- **Rust inline docs:** module-level `//!` and command-level `///` consistently present in critical paths. (Docs)

---

## Roadmap suggestion

- **2.0.1 (this week):** fix all 🔴 CRITICAL items. Small, focused release. Publish the draft so users can actually auto-update.
- **2.1.0 (few weeks):** unification (1-3), perf wins 11-15, basic architecture split (4-5), CI lint/test gates, test scaffolding.
- **2.2.0 (month+):** UX polish (16-21), security hardening, remaining architecture refactors, full test coverage on critical Rust modules.
- **3.0.0 (next major):** if/when the command facade (6) is done — it's the kind of breaking rearrangement worth a major.
