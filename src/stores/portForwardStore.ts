import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

const CONFIG_STORAGE_KEY = 'k8s-gui.port-forward.configs';

export interface PortForwardConfig {
  id: string;
  context: string;
  name: string;
  pod: string;
  namespace: string;
  localPort: number;
  remotePort: number;
  autoReconnect: boolean;
  createdAt: string;
}

export interface PortForwardSession {
  id: string;
  context: string;
  pod: string;
  namespace: string;
  localPort: number;
  remotePort: number;
  autoReconnect: boolean;
  createdAt: string;
}

export interface PortForwardStatus {
  id: string;
  pod: string;
  namespace: string;
  localPort: number;
  remotePort: number;
  status: string;
  message?: string | null;
  attempt?: number | null;
}

interface PortForwardState {
  configs: PortForwardConfig[];
  sessions: PortForwardSession[];
  statusBySession: Record<string, PortForwardStatus>;
  hydrated: boolean;
  hydrate: () => void;
  addConfig: (config: Omit<PortForwardConfig, 'id' | 'createdAt'>) => PortForwardConfig;
  updateConfig: (id: string, updates: Partial<PortForwardConfig>) => void;
  removeConfig: (id: string) => void;
  refreshSessions: () => Promise<void>;
  startConfig: (configId: string) => Promise<PortForwardSession>;
  stopSession: (sessionId: string) => Promise<void>;
  startAllForContext: (context: string) => Promise<{ started: number; skipped: number; failed: number }>;
  setStatus: (status: PortForwardStatus) => void;
}

function loadConfigsFromStorage(): PortForwardConfig[] {
  if (typeof window === 'undefined') {
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
    console.warn('Failed to load port-forward configs:', error);
  }
  return [];
}

function saveConfigsToStorage(configs: PortForwardConfig[]) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configs));
  } catch (error) {
    console.warn('Failed to save port-forward configs:', error);
  }
}

function mapSession(payload: {
  id: string;
  context: string;
  pod: string;
  namespace: string;
  local_port: number;
  remote_port: number;
  auto_reconnect: boolean;
  created_at: string;
}): PortForwardSession {
  return {
    id: payload.id,
    context: payload.context,
    pod: payload.pod,
    namespace: payload.namespace,
    localPort: payload.local_port,
    remotePort: payload.remote_port,
    autoReconnect: payload.auto_reconnect,
    createdAt: payload.created_at,
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
    const sessions = await invoke<any[]>('list_port_forwards');
    set({ sessions: sessions.map(mapSession) });
  },

  startConfig: async (configId) => {
    const config = get().configs.find((item) => item.id === configId);
    if (!config) {
      throw new Error('Port-forward config not found');
    }

    const session = await invoke<any>('port_forward_pod', {
      pod: config.pod,
      namespace: config.namespace,
      config: {
        local_port: config.localPort,
        remote_port: config.remotePort,
        auto_reconnect: config.autoReconnect,
      },
    });

    const mapped = mapSession(session);
    set((state) => ({
      sessions: [...state.sessions.filter((s) => s.id !== mapped.id), mapped],
    }));
    return mapped;
  },

  stopSession: async (sessionId) => {
    await invoke('stop_port_forward', { forwardId: sessionId });
    set((state) => ({
      sessions: state.sessions.filter((session) => session.id !== sessionId),
    }));
  },

  startAllForContext: async (context) => {
    const { configs, sessions } = get();
    const activeKey = new Set(
      sessions.map((session) => `${session.context}:${session.pod}:${session.namespace}:${session.localPort}:${session.remotePort}`)
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
        console.error('Failed to start port-forward:', error);
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
