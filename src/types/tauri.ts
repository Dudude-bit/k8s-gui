// Types for Tauri command responses

export interface PortForwardSessionPayload {
  id: string;
  context: string;
  pod: string;
  namespace: string;
  local_port: number;
  remote_port: number;
  auto_reconnect: boolean;
  created_at: string;
}

export interface ResourceMetadata {
  name: string;
  namespace?: string;
  [key: string]: unknown;
}

export interface ResourceListItem {
  metadata: ResourceMetadata;
  [key: string]: unknown;
}

// Type-safe wrapper for Tauri invoke
export type TauriCommand<T> = () => Promise<T>;
export type TauriCommandWithArgs<T, A = Record<string, unknown>> = (
  args: A
) => Promise<T>;
