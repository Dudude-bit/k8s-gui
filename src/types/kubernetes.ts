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

// Obsolete types removed in favor of @/generated/types

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
