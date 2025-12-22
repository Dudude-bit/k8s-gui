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

// Unified Pod types - most complete version
export interface ContainerState {
  type: "running" | "waiting" | "terminated" | "unknown";
  reason?: string | null;
  exit_code?: number;
}

export interface ContainerInfo {
  name: string;
  image: string;
  ready: boolean;
  state: ContainerState;
  restart_count: number;
  started_at?: string | null;
}

export interface PodStatusInfo {
  phase: string;
  ready: boolean;
  message: string | null;
  reason: string | null;
  conditions: PodCondition[];
}

export interface PodCondition {
  type_: string;
  status: string;
  last_transition_time: string | null;
  reason: string | null;
  message: string | null;
}

export interface PodInfo {
  name: string;
  namespace: string;
  uid: string;
  status: PodStatusInfo;
  node_name: string | null;
  pod_ip: string | null;
  host_ip: string | null;
  containers: ContainerInfo[];
  labels: Record<string, string>;
  annotations: Record<string, string>;
  created_at: string | null;
  restart_count: number;
  // Resource usage metrics (from Metrics API)
  cpu_usage?: string | null;           // in millicores or cores (e.g., "500m", "2")
  memory_usage?: string | null;         // in bytes
  // Resource requests/limits (from spec)
  cpu_requests?: string | null;         // aggregated from all containers
  cpu_limits?: string | null;           // aggregated from all containers
  memory_requests?: string | null;      // aggregated from all containers
  memory_limits?: string | null;        // aggregated from all containers
}

export interface ConditionInfo {
  type_: string;
  status: string;
  reason: string | null;
  message: string | null;
  last_transition_time: string | null;
}

export interface ReplicaInfo {
  desired: number;
  ready: number;
  available: number;
  updated: number;
}

export interface DeploymentInfo {
  name: string;
  namespace: string;
  uid: string;
  replicas: ReplicaInfo;
  strategy: string | null;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  created_at: string | null;
  conditions: ConditionInfo[];
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

export interface ServicePortInfo {
  name: string | null;
  port: number;
  target_port: string;
  node_port: number | null;
  protocol: string;
}

export interface ServiceInfo {
  name: string;
  namespace: string;
  uid: string;
  type_: string;
  cluster_ip: string | null;
  external_ips: string[];
  ports: ServicePortInfo[];
  selector: Record<string, string>;
  labels: Record<string, string>;
  created_at: string | null;
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
  // Resource usage metrics (from Metrics API)
  cpu_usage?: string | null;       // in millicores or cores
  memory_usage?: string | null;     // in bytes
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
