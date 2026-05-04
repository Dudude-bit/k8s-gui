# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-04-28

### Fixed — interactive auth (OIDC, kubelogin, exec plugins)

The "Authentication Required" modal could appear blank when a kubeconfig
context required interactive credentials. Three independent root causes
were closed end-to-end:

- **Race between backend I/O loop and frontend listener.** Terminal
  sessions used to start emitting bytes the moment the adapter
  connected — but the React `listen("terminal-output")` callback
  was still mid-`await`. Tauri events have no replay, so the first
  prompt landed in the void. Backend now blocks on a deferred-start
  oneshot gate; the frontend hook releases it via the new
  `terminal_subscribed` Tauri command only after both `listen()`
  calls have resolved. 60 s safety timeout if the frontend never
  signals.
- **`AuthExecAdapter` swallowed stdout.** Many OIDC tools
  (`kubelogin --grant-type=authcode-keyboard`, some
  `kubectl-oidc_login` variants) print the "open this URL" prompt
  to stdout. The adapter previously dropped stdout (only stderr
  reached the terminal). Now stdout is tee'd into both the JSON
  collector and the terminal stream.
- **Pipes instead of a real PTY.** Tools that call
  `term.ReadPassword` / `getpass` check `isatty(stdin)` and refuse
  to prompt without a TTY. Replaced pipes with a real PTY pair via
  `portable-pty 0.9` (cross-platform: ConPTY on Windows, openpty
  on Unix). `resize` now actually issues `TIOCSWINSZ`.

The same deferred-start handshake also applies to `PodTerminal`
via the shared `useGenericTerminalSession` hook.

### Fixed — log viewer

- **Same listener-race as terminal-auth** applied to
  `stream_pod_logs`. The streamer task now blocks on a
  `log_stream_subscribed` gate.
- **Stable React keys.** `LogViewer` keyed on filtered-array index,
  so changing the search query unmounted unrelated rows. Each log
  line now carries a synthetic monotonic id assigned at receive time.
- **RAII cleanup guard** for the spawned log-stream task. Panic in
  `streamer.stream_logs()` (or any other unwind path) used to leave
  a zombie entry in `state.log_streams`; the entry is now removed
  by a Drop guard on every exit.

### Fixed — port-forward

Same RAII cleanup guard pattern applied to the port-forward listener
spawn. A panic in `listener.accept()` no longer leaves orphaned
entries in `state.port_forward_sessions` /
`state.port_forward_controls`.

### Performance

- **K8s watch instead of 2-second polling.** A new `WatchManager`
  owns `kube::runtime::watcher` streams keyed by `(cluster, kind,
namespace)`. Events are forwarded to the frontend over a
  `resource-event` Tauri broadcast and applied to the TanStack
  Query cache via `setQueryData` — no refetch round-trip.
  **All 16 list pages migrated** (ConfigMap, Secret, Service,
  Endpoints, Ingress, PersistentVolumeClaim, Pod, Deployment,
  StatefulSet, DaemonSet, Job, CronJob, Node, PersistentVolume,
  StorageClass, CustomResource).
- **Watch failure detection + automatic polling fallback.** If the
  kubeconfig user lacks the `watch` verb (or kube-apiserver is
  unreachable), the backend emits a `Failed` event after three
  consecutive errors. The frontend toasts «Real-time updates
  unavailable: <kind>: falling back to periodic refresh» and
  re-enables the underlying `useQuery`'s `refetchInterval`. When
  the watcher recovers, the page auto-flips back to pure-watch
  mode.
- **Initial JS bundle 408 KB → 197 KB gzip (-52%).** CodeMirror
  (`YamlEditor`) and xterm (`Terminal`) are now lazy-loaded behind
  `React.lazy`; their chunks fetch only when a screen mounts them.
- **Log-stream events now batched** (50 ms tick or 100 lines,
  whichever first). Renamed Tauri event `log-line` → `log-batch`;
  payload carries `Vec<LogLineEvent>`. Verbose pods (100+ lines/sec)
  generate ~5× fewer Tauri round-trips.

### Security

- `AuthResult` no longer derives `Debug` — manual impl emits
  `<redacted>` for `token` and `refresh_token`. Defense-in-depth
  against future code that might log the struct.
- `K8sClientManager::load_kubeconfig_from_path` canonicalizes the
  path (resolves `~`, `..`, symlinks) before opening the file.
  Returns a clear `AuthError::Kubeconfig` on a missing target.
- New `.github/workflows/codeql.yml` runs CodeQL JavaScript /
  TypeScript analysis with `security-extended` queries on every
  push/PR plus a weekly Monday cron.

### Refactors / hygiene

- `WatchManager`, `LogStream`, `PortForwardSession` cleanup all
  follow the same RAII Drop-guard pattern. Adding a new long-lived
  background task is now a one-line `let _cleanup = …;` at the top
  of the spawn.
- `eslint` count: **59 → 0**. The pre-existing 59 warnings from
  the react-hooks 4 → 7 upgrade (set-state-in-effect,
  preserve-caught-error, only-export-components, etc.) are all
  closed: real refactors where derivable, documented disables with
  rationale where genuinely event-driven, mechanical
  `{ cause: err }` for caught-error preservation. Lefthook enforces
  zero-lint going forward.
- `tsconfig` target bumped ES2020 → ES2022 (needed for
  `Error(message, { cause })`). Vite's emit target is already
  safari15 / chrome110, so runtime support matches.
- Tests: 113 → 129 cargo (+16), 70 → 100 vitest (+30), including
  characterization tests for `AuthTerminal`, end-to-end handshake
  tests for every deferred-start gate, and cache-mutation tests
  for `useResourceWatch`.

### Adding a new K8s resource watch (5-step recipe for contributors)

1. Ensure `KindInfo` has `From<&K8sType>` (most do).
2. One `subscribe_namespaced!` or `subscribe_cluster!` macro line
   in `commands/watch.rs`.
3. One `commands::watch::subscribe_<kind>_watch` line in `main.rs`'s
   invoke handler.
4. One `subscribe<Kind>Watch(...)` binding in
   `src/generated/commands.ts`.
5. One `watch:` field on the page's `createResourceListPage` /
   `createWorkloadListPage` config (or call `useResourceWatch`
   directly for hand-rolled pages).

### Known issues (deferred to a future minor)

- Five long files (`InfrastructureBuilder.tsx` 1222 LOC, `Helm.tsx`
  1037, `InspectorPanel.tsx` 1015, `PodDetail.tsx` 833,
  `src-tauri/src/logs/mod.rs` 910) are still single-file monoliths.
  Each is its own focused refactor with TDD safety net.
- Pod / Node metrics still poll. Metrics k8s API has a different
  shape than the typed list APIs — separate migration.

## [2.0.1] - 2026-04-25

### Fixed

- `rules-of-hooks` violations in `StatefulSetDetail`, `DaemonSetDetail`,
  and `JobDetail`: a conditional early-return ran before `useMemo`,
  shifting hook order between renders. Hook now runs first.
- `NodeDetail` rebuilt the page icon component inside a JSX IIFE on every
  render. Hoisted to module scope.
- `InspectorPanel` form-init effect was flagged by the stricter
  `react-hooks/exhaustive-deps` after the React 19 / react-hooks 7
  upgrade. The narrow dep list (`[node?.id]`) is intentional —
  documented inline so future readers see the design.

### Security

- Replaced `"csp": null` in `tauri.conf.json` with a restrictive
  Content-Security-Policy. Limits what a malicious K8s server response
  could execute inside the WebView.

### CI / Tooling

- New `.github/workflows/ci.yml` — fast lint + test job on every
  push/PR (cargo fmt, cargo clippy informational, cargo test, tsc
  noEmit, npm run lint informational).
- `.npmrc` pins `include=optional` so platform-specific native
  bindings stay in `package-lock.json` regardless of where the
  lockfile was regenerated.
- Removed `Dockerfile.linux-build` (long-dead, replaced by GitHub
  Actions Linux build).
- Applied `cargo fmt` across `src-tauri/` (one-time cleanup on
  rust 1.95).

### Known issues (deferred to 2.1)

- `tokio::spawn` calls in `commands/logs.rs` and
  `commands/port_forward.rs` don't track JoinHandles — task panics
  leave entries in state maps. Architectural fix planned.
- `npm run lint` surfaces ~49 errors after the
  eslint-plugin-react-hooks 4 → 7 upgrade. Most are stylistic
  (set-state-in-effect, preserve-caught-error); none are runtime
  bugs. Triage planned.
- See `docs/superpowers/specs/2026-04-24-post-v2-audit-findings.md`
  for the full roadmap.

## [2.0.0] - 2026-04-24

### Added

- Initial open-source release under MIT license.

### Removed

- Proprietary licensing and premium feature gating.
