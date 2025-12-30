/**
 * Port Forward Store
 *
 * Manages port forwarding configurations and active sessions.
 * Persists port forward configurations to localStorage and tracks
 * active sessions from the Tauri backend.
 *
 * @module stores/portForwardStore
 */

import { create } from "zustand";
import * as commands from "@/generated/commands";
import type {
  PortForwardSessionInfo,
  PortForwardRequest,
} from "@/generated/types";

/** LocalStorage key for port forward configurations */
const CONFIG_STORAGE_KEY = "k8s-gui.port-forward.configs";

/**
 * Saved port forward configuration
 *
 * Represents a user-defined port forward rule that can be
 * started/stopped and is persisted across sessions.
 */
export interface PortForwardConfig {
  /** Unique identifier */
  id: string;
  /** Kubernetes context name */
  context: string;
  /** Display name for the configuration */
  name: string;
  /** Target pod name */
  pod: string;
  /** Target namespace */
  namespace: string;
  /** Local port to listen on */
  localPort: number;
  /** Remote port on the pod */
  remotePort: number;
  /** Whether to automatically reconnect on failure */
  autoReconnect: boolean;
  /** ISO timestamp when created */
  createdAt: string;
}

/**
 * Active port forward session
 *
 * Represents a currently running port forward from the backend.
 */
export interface PortForwardSession {
  /** Session ID from backend */
  id: string;
  /** Kubernetes context name */
  context: string;
  /** Target pod name */
  pod: string;
  /** Target namespace */
  namespace: string;
  /** Local port being listened on */
  localPort: number;
  /** Remote port on the pod */
  remotePort: number;
  /** Whether auto-reconnect is enabled */
  autoReconnect: boolean;
  /** ISO timestamp when started */
  createdAt: string;
}

/**
 * Port forward status update from backend events
 */
export interface PortForwardStatus {
  /** Session ID */
  id: string;
  /** Target pod name */
  pod: string;
  /** Target namespace */
  namespace: string;
  /** Local port */
  localPort: number;
  /** Remote port */
  remotePort: number;
  /** Current status (e.g., "active", "connecting", "failed") */
  status: string;
  /** Optional status message */
  message?: string | null;
  /** Reconnection attempt number */
  attempt?: number | null;
}

interface PortForwardState {
  configs: PortForwardConfig[];
  sessions: PortForwardSession[];
  statusBySession: Record<string, PortForwardStatus>;
  hydrated: boolean;
  hydrate: () => void;
  addConfig: (
    config: Omit<PortForwardConfig, "id" | "createdAt">
  ) => PortForwardConfig;
  updateConfig: (id: string, updates: Partial<PortForwardConfig>) => void;
  removeConfig: (id: string) => void;
  refreshSessions: () => Promise<void>;
  startConfig: (configId: string) => Promise<PortForwardSession>;
  stopSession: (sessionId: string) => Promise<void>;
  startAllForContext: (
    context: string
  ) => Promise<{ started: number; skipped: number; failed: number }>;
  setStatus: (status: PortForwardStatus) => void;
}

function loadConfigsFromStorage(): PortForwardConfig[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn("Failed to load port-forward configs:", error);
  }
  return [];
}

function saveConfigsToStorage(configs: PortForwardConfig[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configs));
  } catch (error) {
    console.warn("Failed to save port-forward configs:", error);
  }
}

function mapSession(payload: PortForwardSessionInfo): PortForwardSession {
  return {
    id: payload.id,
    context: payload.context,
    pod: payload.pod,
    namespace: payload.namespace,
    localPort: payload.localPort,
    remotePort: payload.remotePort,
    autoReconnect: payload.autoReconnect,
    createdAt: payload.createdAt,
  };
}

export const usePortForwardStore = create<PortForwardState>((set, get) => ({
  configs: [],
  sessions: [],
  statusBySession: {},
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) {
      return;
    }
    const configs = loadConfigsFromStorage();
    set({ configs, hydrated: true });
  },

  addConfig: (config) => {
    const newConfig: PortForwardConfig = {
      ...config,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const configs = [...get().configs, newConfig];
    saveConfigsToStorage(configs);
    set({ configs });
    return newConfig;
  },

  updateConfig: (id, updates) => {
    const configs = get().configs.map((config) =>
      config.id === id ? { ...config, ...updates } : config
    );
    saveConfigsToStorage(configs);
    set({ configs });
  },

  removeConfig: (id) => {
    const configs = get().configs.filter((config) => config.id !== id);
    saveConfigsToStorage(configs);
    set({ configs });
  },

  refreshSessions: async () => {
    const sessions = await commands.listPortForwards();
    set({ sessions: sessions.map(mapSession) });
  },

  startConfig: async (configId) => {
    const config = get().configs.find((item) => item.id === configId);
    if (!config) {
      throw new Error("Port-forward config not found");
    }

    const portForwardConfig: PortForwardRequest = {
      localPort: config.localPort,
      remotePort: config.remotePort,
      autoReconnect: config.autoReconnect,
    };

    const session = await commands.portForwardPod(
      config.pod,
      config.namespace,
      portForwardConfig
    );

    const mapped = mapSession(session);
    set((state) => ({
      sessions: [...state.sessions.filter((s) => s.id !== mapped.id), mapped],
    }));
    return mapped;
  },

  stopSession: async (sessionId) => {
    await commands.stopPortForward(sessionId);
    set((state) => ({
      sessions: state.sessions.filter((session) => session.id !== sessionId),
    }));
  },

  startAllForContext: async (context) => {
    const { configs, sessions } = get();
    const activeKey = new Set(
      sessions.map(
        (session) =>
          `${session.context}:${session.pod}:${session.namespace}:${session.localPort}:${session.remotePort}`
      )
    );

    let started = 0;
    let skipped = 0;
    let failed = 0;

    const toStart = configs.filter((config) => config.context === context);
    for (const config of toStart) {
      const key = `${config.context}:${config.pod}:${config.namespace}:${config.localPort}:${config.remotePort}`;
      if (activeKey.has(key)) {
        skipped += 1;
        continue;
      }
      try {
        await get().startConfig(config.id);
        started += 1;
      } catch (error) {
        console.error("Failed to start port-forward:", error);
        failed += 1;
      }
    }

    return { started, skipped, failed };
  },

  setStatus: (status) => {
    set((state) => ({
      statusBySession: {
        ...state.statusBySession,
        [status.id]: status,
      },
    }));
  },
}));
