# Frontend TDD Rewrite — Design

**Date:** 2026-04-26
**Driver:** Project has effectively zero users. Joel-style "never rewrite" arguments
weaken; with TDD as a baseline, regressions are catchable. Worth investing in
better foundations now, before scale.

## Goal

Migrate every existing screen to a tested, componentised, factory-backed
implementation. Done page-by-page, never as a single drop. Each PR ships
independently — no months-long no-value rewrite branch.

## Approach

1. **Add UI test infra** — `@testing-library/react` + `jsdom` + `vitest` setup
   file with shared mocks for `@tauri-apps/api` and TanStack Query.
2. **Pick proof-of-concept page**: `NodeDetail.tsx`. Cluster-scoped (no
   namespace), small enough to hold in head, exercises every detail-page
   pattern (info card, conditions, metrics card, debug action, YAML tab).
3. **For the PoC page (and every page after it):**
   - Read current implementation. Identify the behaviours that exist.
   - Write Vitest cases for each visible behaviour (renders, branches,
     interactions). Tests fail because the component isn't refactored yet.
   - Refactor: extract sub-components, hoist computed values out of render,
     fix any bugs surfaced by writing the tests.
   - Tests pass. Commit.
4. **After the second detail page (`PodDetail.tsx` — namespaced + metrics +
   logs + terminal):** extract the common shape into a
   `createDetailPage<T>()` factory. Migrate the remaining ~13 detail pages
   onto it.
5. **Same approach for list pages** afterwards: pick a simple list (`NodeList`)
   to bootstrap, then `PodList` to challenge the pattern, then factory-extract.

## Non-goals (this spec)

- Backend changes (orphaned spawns, K8s watch, etc.) — separate work.
- Refactoring `InfrastructureBuilder.tsx` (unique screen, no factory leverage).
- Visual redesign — pages keep the same look, only structure changes.

## Success criteria

- Every refactored page has Vitest cases covering its renders, branches, and
  user interactions.
- `npm test` runs in CI and gates merge.
- Detail pages collectively shrink by ~70% LOC after factory migration.
- Adding a new K8s resource type is a config object + ~20 LOC, not a 400-LOC
  page copy.

## Sequencing

- PR1: UI test infra (vitest setup file, jsdom, RTL, mocks).
- PR2: NodeDetail tests + small refactor.
- PR3: PodDetail tests + refactor + extract `createDetailPage` factory.
- PR4..N: migrate remaining detail pages, one per PR, each with tests.
- Then: same approach for list pages.

Bug fixes (terminal auth, log viewer) interleave whenever a screen
containing the bug is touched.
