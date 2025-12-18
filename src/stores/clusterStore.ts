import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface ClusterContext {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
}

interface ClusterState {
  contexts: ClusterContext[];
  currentContext: string | null;
  currentNamespace: string;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadContexts: () => Promise<void>;
  switchContext: (context: string) => Promise<void>;
  switchNamespace: (namespace: string) => Promise<void>;
  connect: (context?: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

export const useClusterStore = create<ClusterState>((set, get) => ({
  contexts: [],
  currentContext: null,
  currentNamespace: 'default',
  isConnected: false,
  isLoading: false,
  error: null,

  loadContexts: async () => {
    set({ isLoading: true, error: null });
    try {
      const contexts = await invoke<ClusterContext[]>('list_contexts');
      const currentContext = await invoke<string | null>('get_current_context');
      set({ contexts, currentContext, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  switchContext: async (context: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('switch_context', { context });
      set({ currentContext: context, currentNamespace: 'default', isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  switchNamespace: async (namespace: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('switch_namespace', { namespace });
      set({ currentNamespace: namespace, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  connect: async (context?: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('connect_cluster', { context });
      const currentContext = await invoke<string | null>('get_current_context');
      set({ currentContext, isConnected: true, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false, isConnected: false });
    }
  },

  disconnect: async () => {
    const { currentContext } = get();
    if (currentContext) {
      try {
        await invoke('disconnect_cluster', { context: currentContext });
      } catch (error) {
        console.error('Error disconnecting:', error);
      }
    }
    set({ isConnected: false, currentContext: null });
  },
}));
