# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
