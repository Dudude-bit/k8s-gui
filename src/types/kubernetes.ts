// Kubernetes resource types for the frontend

export interface ClusterContext {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  is_current: boolean;
}

export interface ClusterInfo {
  name: string;
  server: string;
  version: string;
  platform: string;
  nodes: number;
  namespaces: number;
}

export interface Namespace {
  name: string;
  status: string;
  age: string;
  labels: Record<string, string>;
}

export interface PodInfo {
  name: string;
  namespace: string;
  status: string;
  phase: string;
  ready: string;
  restarts: number;
  node_name: string | null;
  pod_ip: string | null;
  host_ip: string | null;
  start_time: string | null;
  age: string;
  containers: ContainerInfo[];
  labels: Record<string, string>;
  annotations: Record<string, string>;
  conditions: PodCondition[];
}

export interface ContainerInfo {
  name: string;
  image: string;
  ready: boolean;
  restart_count: number;
  state: string;
  started_at: string | null;
}

export interface PodCondition {
  type: string;
  status: string;
  last_transition_time: string | null;
  reason: string | null;
  message: string | null;
}

export interface DeploymentInfo {
  name: string;
  namespace: string;
  replicas: number;
  ready_replicas: number;
  available_replicas: number;
  unavailable_replicas: number;
  strategy: string;
  selector: Record<string, string>;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  containers: ContainerSpec[];
  conditions: DeploymentCondition[];
  created_at: string | null;
  age: string;
}

export interface ContainerSpec {
  name: string;
  image: string;
  ports: number[];
  resources: {
    requests: Record<string, string>;
    limits: Record<string, string>;
  };
}

export interface DeploymentCondition {
  type: string;
  status: string;
  reason: string | null;
  message: string | null;
  last_update_time: string | null;
}

export interface ServiceInfo {
  name: string;
  namespace: string;
  service_type: string;
  cluster_ip: string;
  external_ip: string | null;
  ports: string[];
  selector: Record<string, string>;
  age: string;
}

export interface NodeInfo {
  name: string;
  status: string;
  roles: string[];
  version: string;
  internal_ip: string | null;
  external_ip: string | null;
  os_image: string;
  kernel_version: string;
  container_runtime: string;
  cpu_capacity: string;
  memory_capacity: string;
  pod_count: number;
  age: string;
  is_schedulable: boolean;
}

export interface NodeResources {
  cpu_capacity: string;
  cpu_allocatable: string;
  memory_capacity: string;
  memory_allocatable: string;
  pods_capacity: string;
  pods_allocatable: string;
}

export interface NodeCondition {
  type: string;
  status: string;
  reason: string | null;
  message: string | null;
  last_transition_time: string | null;
}

export interface ConfigMapInfo {
  name: string;
  namespace: string;
  data_keys: string[];
  age: string;
}

export interface SecretInfo {
  name: string;
  namespace: string;
  secret_type: string;
  data_keys: string[];
  age: string;
}

export interface EventInfo {
  name: string;
  namespace: string;
  type: string;
  reason: string;
  message: string;
  source: string;
  involved_object: {
    kind: string;
    name: string;
    namespace: string | null;
  };
  count: number;
  first_timestamp: string | null;
  last_timestamp: string | null;
  age: string;
}

export interface EventSummary {
  total: number;
  normal: number;
  warning: number;
  by_reason: Record<string, number>;
}

export interface HelmRelease {
  name: string;
  namespace: string;
  revision: number;
  status: string;
  chart: string;
  app_version: string;
  updated: string;
}

export interface HelmReleaseHistory {
  revision: number;
  status: string;
  chart: string;
  app_version: string;
  description: string;
  updated: string;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string | null;
  enabled: boolean;
  plugin_type: "kubectl" | "helm" | "context_menu" | "renderer";
}

export interface AuthStatus {
  authenticated: boolean;
  method: string | null;
  user: string | null;
  expires_at: string | null;
}

export interface AppConfig {
  theme: "light" | "dark" | "system";
  kubernetes: {
    default_namespace: string;
    request_timeout: number;
    watch_bookmark_interval: number;
  };
  cache: {
    enabled: boolean;
    ttl_seconds: number;
    max_entries: number;
  };
  plugins: {
    enabled: boolean;
    auto_discover: boolean;
    paths: string[];
  };
  logging: {
    level: string;
    file_enabled: boolean;
    max_file_size_mb: number;
  };
}

export interface KeyboardShortcut {
  id: string;
  name: string;
  description: string;
  default_keys: string;
  current_keys: string;
}

export interface AppInfo {
  name: string;
  version: string;
  tauri_version: string;
  rust_version: string;
  os: string;
  arch: string;
}

// Filter types
export interface PodFilters {
  namespace?: string;
  label_selector?: string;
  field_selector?: string;
  status?: string;
}

export interface ResourceFilters {
  namespace?: string;
  label_selector?: string;
  field_selector?: string;
}

// Rollout status
export interface RolloutStatus {
  is_complete: boolean;
  current_replicas: number;
  updated_replicas: number;
  ready_replicas: number;
  available_replicas: number;
  message: string;
}

// Terminal session
export interface TerminalSession {
  session_id: string;
  pod: string;
  namespace: string;
  container: string;
  created_at: string;
}

// Log streaming
export interface LogOptions {
  container?: string;
  follow?: boolean;
  tail_lines?: number;
  since_seconds?: number;
  timestamps?: boolean;
}
