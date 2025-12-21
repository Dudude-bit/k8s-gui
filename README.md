# K8s GUI

A cross-platform Kubernetes GUI built with Tauri, Rust, and React. It focuses on fast cluster navigation, operational tooling, and a visual Infrastructure Builder with YAML sync.

![K8s GUI](https://img.shields.io/badge/Tauri-2.1-blue)
![Rust](https://img.shields.io/badge/Rust-1.70+-orange)
![React](https://img.shields.io/badge/React-18-61dafb)
![License](https://img.shields.io/badge/License-MIT-green)

## Highlights

- Visual Infrastructure Builder with drag-and-drop and YAML mode.
- Logs, exec terminal, and port-forwarding.
- Multi-context authentication (kubeconfig, OIDC, EKS, tokens).
- Rust backend with Tauri IPC and real-time events.

## Features

### Authentication and Security
- **Kubeconfig**: Auto-detect and switch contexts
- **Bearer Token**: Direct token auth
- **Client Certificates**: X.509 auth
- **OIDC**: OpenID Connect with PKCE
- **AWS EKS**: IAM auth flow
- **Secure Storage**: System keyring for credentials

### Infrastructure Builder
- **Visual canvas** (React Flow) with drag-and-drop resources
- **YAML editor** (CodeMirror) with two-way sync
- **Import from cluster** to canvas
- **Validate / Apply** via `kubectl`
- **Templates** for common stacks
- **Selection tools**: lasso, delete selection, select-all, invert selection
- **Safety**: imported resources excluded from Apply/Validate by default

### Workloads
- Pods: status, logs, exec/shell, delete, restart
- Deployments: scale, restart, image updates, view pods
- StatefulSets, DaemonSets, Jobs, CronJobs

### Networking
- Services: endpoints, pod selection, port-forward
- Ingresses: rules and routes
- Endpoints: subsets and target refs

### Storage
- Persistent Volumes (PV)
- Persistent Volume Claims (PVC)
- Storage Classes

### Configuration
- ConfigMaps: CRUD and YAML view
- Secrets: CRUD and YAML view (without exposing values)

### Cluster Operations
- Nodes: resources, conditions, pods, cordon/uncordon, drain
- Events: live and filtered views
- Namespaces: scope resources

### Observability and Ops
- Log streaming with follow mode
- Terminal exec sessions
- Copy files to/from containers
- Port-forward manager with saved profiles and auto-reconnect

### Plugin System
- **kubectl plugins**: discover and execute installed plugins
- **Helm**: list releases, inspect manifests, rollback, uninstall

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   TanStack   │  │    Radix     │  │    Zustand   │              │
│  │    Query     │  │     UI       │  │    State     │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  React Flow  │  │  CodeMirror  │  │   xterm.js   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└────────────────────────────┬────────────────────────────────────────┘
                             │ Tauri IPC
┌────────────────────────────┴────────────────────────────────────────┐
│                         Backend (Rust)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │    kube-rs   │  │   AWS SDK    │  │   Keyring    │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│  ┌──────────────────────────────────────────────────────┐          │
│  │      Tauri Commands + Events + Plugin System         │          │
│  │     kubectl plugins │ Helm │ Context Menus           │          │
│  └──────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Radix UI
- **State/Data**: Zustand, TanStack Query
- **Canvas/Editor**: React Flow, CodeMirror
- **Charts/Terminal**: Recharts, xterm.js
- **Backend**: Rust, Tauri 2, tokio, kube-rs, k8s-openapi
- **Auth/Cloud**: AWS SDK, OIDC

## Prerequisites

- **Rust** 1.70+
- **Node.js** 18+
- **Tauri CLI**: `cargo install tauri-cli`
- **kubectl** (required for manifest validate/apply)
- **helm** (optional, for Helm features)

### Platform-specific

#### macOS
```bash
xcode-select --install
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

#### Windows
- Visual Studio Build Tools with C++ workload
- WebView2 (usually pre-installed on Windows 10/11)

## Development

Install frontend dependencies:
```bash
npm install
```

Run in dev mode:
```bash
cargo tauri dev
```

Build frontend only:
```bash
npm run build
```

Lint:
```bash
npm run lint
```

## Build (Release)

```bash
cargo tauri build
```

The bundled app will be in `target/release/bundle/`.

## Configuration

### Application config paths
- **macOS**: `~/Library/Application Support/com.k8s-gui.app/`
- **Linux**: `~/.config/k8s-gui/`
- **Windows**: `%APPDATA%\\k8s-gui\\`

### Kubeconfig resolution
1. `KUBECONFIG` env var
2. `~/.kube/config`

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `KUBECONFIG` | Path to kubeconfig file | `~/.kube/config` |
| `K8S_GUI_LOG` | Log level (error, warn, info, debug, trace) | `info` |
| `K8S_GUI_CACHE_TTL` | Cache TTL in seconds | `300` |

## Usage Tips

- **Command palette**: `Cmd/Ctrl + K`
- **Builder shortcuts**: Delete/Backspace removes selection, `Cmd/Ctrl + A` selects all, `Cmd/Ctrl + Shift + I` inverts selection.
- Imported resources are excluded from Apply/Validate by default; toggle "Include imported" to override.

## Security

- Credentials stored via system keyring
- OIDC uses PKCE
- No secrets stored in plain text

## License

MIT
