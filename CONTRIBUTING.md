# Contributing to K8s GUI

Thanks for your interest in contributing.

## Local development

### Prerequisites

- Rust stable (`rustup default stable`)
- Node.js 20+
- Tauri platform dependencies: <https://v2.tauri.app/start/prerequisites/>

### Setup

```bash
git clone https://github.com/Dudude-bit/k8s-gui.git
cd k8s-gui
npm install
npm run tauri dev
```

## Code style

- **Rust:** `cargo fmt` and `cargo clippy` must pass.
- **TypeScript:** ESLint + Prettier (configs are in the repo).

Before committing:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npm run lint
```

## Tests

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

## Commit convention

[Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `refactor:` code restructuring without behavior change
- `chore:` tooling, build, deps
- `test:` tests only

## Pull requests

1. Fork the repo.
2. Create a feature branch from `main`.
3. Keep PRs focused — one topic per PR.
4. Link the related issue in the description.
5. Ensure CI is green before requesting review.

## Issues

- Bug reports: use the bug template (include reproduction steps, OS, k8s version).
- Feature requests: explain the use case, not just the proposal.
