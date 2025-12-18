# K8s GUI

A modern, production-ready Kubernetes GUI application built with Rust and Tauri. Features a minimalist Lens-inspired interface with comprehensive cluster management capabilities.

![K8s GUI](https://img.shields.io/badge/Tauri-2.1-blue)
![Rust](https://img.shields.io/badge/Rust-1.70+-orange)
![React](https://img.shields.io/badge/React-18-61dafb)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

### Authentication
- **Kubeconfig**: Automatic detection and support for multiple contexts
- **Bearer Token**: Direct token-based authentication
- **Client Certificates**: X.509 certificate authentication
- **OIDC**: OpenID Connect with PKCE flow support
- **AWS EKS**: Native AWS IAM authentication for EKS clusters
- **Secure Credential Storage**: Uses system keyring for secure credential storage

### Resource Management
- **Full CRUD Operations**: Create, read, update, delete Kubernetes resources
- **Real-time Watching**: Live resource updates via Kubernetes watch API
- **Multi-namespace Support**: Manage resources across namespaces
- **YAML Editor**: View and edit resources in YAML format

### Workloads
- Pods: View, logs, exec/shell, delete, restart
- Deployments: Scale, restart, rollback, update images
- StatefulSets, DaemonSets, ReplicaSets
- Jobs and CronJobs

### Networking
- Services: View endpoints, port forwarding
- Ingresses: Traffic routing configuration
- Network Policies

### Storage
- Persistent Volumes (PV)
- Persistent Volume Claims (PVC)
- Storage Classes

### Configuration
- ConfigMaps: View, edit, create
- Secrets: Secure viewing and management

### Cluster Operations
- Nodes: Resource monitoring, cordon/uncordon, drain
- Events: Real-time event streaming and filtering
- Namespaces: Switch and manage namespaces

### Plugin System
- **kubectl Plugins**: Discover and execute kubectl plugins
- **Helm Integration**: Full Helm 3 support (list, install, upgrade, rollback)
- **Context Menu Extensions**: Custom actions for resources
- **Resource Renderers**: Custom resource visualization

### Log Streaming
- Real-time log streaming with follow mode
- Multi-container log viewing
- Search and filter logs
- Download logs to file
- Syntax highlighting

### Terminal/Exec
- Interactive shell access to containers
- Command execution in pods
- File copy to/from containers
- Resize support

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   TanStack   │  │    Radix     │  │    Zustand   │              │
│  │    Query     │  │     UI       │  │    State     │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│  ┌──────────────────────────────────────────────────────┐          │
│  │                    xterm.js                          │          │
│  └──────────────────────────────────────────────────────┘          │
└────────────────────────────┬────────────────────────────────────────┘
                             │ Tauri IPC
┌────────────────────────────┴────────────────────────────────────────┐
│                         Backend (Rust)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │    kube-rs   │  │   AWS SDK    │  │   Keyring    │              │
│  │              │  │              │  │              │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│  ┌──────────────────────────────────────────────────────┐          │
│  │                  Plugin System                        │          │
│  │    kubectl plugins │ Helm │ Context Menus            │          │
│  └──────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Rust**: 1.70 or later
- **Node.js**: 18 or later
- **pnpm**: 8 or later (or npm/yarn)
- **Tauri CLI**: `cargo install tauri-cli`

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

## Installation

### From Source

1. Clone the repository:
```bash
git clone https://github.com/yourusername/k8s-gui.git
cd k8s-gui
```

2. Install frontend dependencies:
```bash
cd ui
pnpm install
cd ..
```

3. Build and run in development mode:
```bash
cargo tauri dev
```

4. Build for production:
```bash
cargo tauri build
```

The built application will be in `target/release/bundle/`.

## Configuration

### Application Configuration

The app stores configuration in the following locations:

- **macOS**: `~/Library/Application Support/com.k8s-gui.app/`
- **Linux**: `~/.config/k8s-gui/`
- **Windows**: `%APPDATA%\k8s-gui\`

### Kubeconfig

The app automatically detects kubeconfig from:
1. `KUBECONFIG` environment variable
2. `~/.kube/config`

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `KUBECONFIG` | Path to kubeconfig file | `~/.kube/config` |
| `K8S_GUI_LOG` | Log level (error, warn, info, debug, trace) | `info` |
| `K8S_GUI_CACHE_TTL` | Cache TTL in seconds | `300` |

## Usage

### Connecting to a Cluster

1. Launch the application
2. Click "Connect" in the header
3. Select a context from your kubeconfig, or configure a new connection
4. For EKS clusters, choose "AWS EKS" and select your cluster

### Viewing Resources

- Use the sidebar to navigate between resource types
- Click on a resource to view details
- Use the search bar to filter resources

### Managing Pods

- **View Logs**: Click the logs icon or use the action menu
- **Shell Access**: Click "Shell" to open an interactive terminal
- **Delete**: Use the action menu to delete pods

### Scaling Deployments

1. Navigate to Workloads > Deployments
2. Click on a deployment
3. Use the "Scale" button to adjust replicas

### Port Forwarding

1. Navigate to Network > Services
2. Click on a service
3. Click "Port Forward" and configure local port

### Helm Operations

1. Navigate to Helm in the sidebar
2. View installed releases
3. Use actions to upgrade, rollback, or uninstall

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open command palette |
| `Cmd/Ctrl + ,` | Open settings |
| `Cmd/Ctrl + Shift + P` | Open command palette |
| `Cmd/Ctrl + /` | Toggle sidebar |
| `Escape` | Close modals/panels |

## Plugin Development

### kubectl Plugins

The app automatically discovers kubectl plugins in your PATH. Plugins should follow the kubectl plugin naming convention: `kubectl-<name>`.

### Custom Resource Renderers

Create custom renderers for CRDs by implementing the `ResourceRenderer` trait:

```rust
pub struct MyCustomRenderer;

impl ResourceRenderer for MyCustomRenderer {
    fn name(&self) -> &str {
        "my-custom-renderer"
    }
    
    fn can_render(&self, resource: &DynamicObject) -> bool {
        resource.types.as_ref()
            .map(|t| t.kind == "MyCustomResource")
            .unwrap_or(false)
    }
    
    fn render(&self, resource: &DynamicObject) -> Result<String, Error> {
        // Return custom HTML/markdown
    }
}
```

## Security

- Credentials are stored securely using the system keyring
- OIDC uses PKCE flow for enhanced security
- No credentials are stored in plain text
- TLS verification is enabled by default

## Troubleshooting

### Connection Issues

1. Verify your kubeconfig is valid: `kubectl cluster-info`
2. Check network connectivity to the cluster
3. Ensure your credentials haven't expired

### EKS Authentication

1. Ensure AWS CLI is configured: `aws sts get-caller-identity`
2. Verify IAM permissions for EKS access
3. Check the cluster's aws-auth ConfigMap

### Performance

- Large clusters may experience slower initial load
- Use namespace filtering to reduce resource count
- Adjust cache TTL in settings if needed

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a pull request

### Development Guidelines

- Follow Rust idioms and best practices
- Use meaningful commit messages
- Add tests for new functionality
- Update documentation as needed

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Tauri](https://tauri.app/) - Cross-platform app framework
- [kube-rs](https://github.com/kube-rs/kube) - Kubernetes client for Rust
- [Lens](https://k8slens.dev/) - UI inspiration
- [shadcn/ui](https://ui.shadcn.com/) - UI components
