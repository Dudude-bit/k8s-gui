import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

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
  isAuthenticating: boolean;
  error: string | null;
  pendingContext: string | null;
  errorContext: string | null;
  connectionAttemptId: number;

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
  currentNamespace: "", // Empty string means all namespaces
  isConnected: false,
  isLoading: false,
  isAuthenticating: false,
  error: null,
  pendingContext: null,
  errorContext: null,
  connectionAttemptId: 0,

  loadContexts: async () => {
    set({ isLoading: true, error: null, errorContext: null });
    try {
      const contexts = await invoke<ClusterContext[]>("list_contexts");
      const currentContext = await invoke<string | null>("get_current_context");
      set({ contexts, currentContext, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  switchContext: async (context: string) => {
    const previousContext = get().currentContext;
    const nextNamespace =
      previousContext && previousContext !== context ? "" : get().currentNamespace;
    set({
      currentContext: context,
      currentNamespace: nextNamespace,
      error: null,
      errorContext: null,
    });
  },

  switchNamespace: async (namespace: string) => {
    // Don't set isLoading for namespace switch - it causes flickering
    // Just update the namespace immediately, queries will refetch automatically
    try {
      await invoke("switch_namespace", { namespace });
      set({ currentNamespace: namespace });
    } catch (error) {
      set({ error: String(error), errorContext: null });
    }
  },

  connect: async (context?: string) => {
    const targetContext = context ?? get().currentContext;
    if (!targetContext) {
      set({ error: "No cluster selected", errorContext: null });
      return;
    }

    // Prevent multiple concurrent connection attempts to the same context
    if (get().isAuthenticating && get().pendingContext === targetContext) {
      return;
    }

    const previousContext = get().currentContext;
    if (previousContext && previousContext !== targetContext) {
      invoke("disconnect_cluster", { context: previousContext }).catch(() => {
        // Best-effort cleanup to avoid stale auth sessions.
      });
    }
    const nextNamespace =
      previousContext && previousContext !== targetContext
        ? ""
        : get().currentNamespace;
    const attemptId = get().connectionAttemptId + 1;

    set({
      isLoading: true,
      isAuthenticating: true,
      error: null,
      errorContext: null,
      pendingContext: targetContext,
      currentContext: targetContext,
      currentNamespace: nextNamespace,
      isConnected: false,
      connectionAttemptId: attemptId,
    });
    try {
      const info = await invoke<{ context: string }>("connect_cluster", {
        context: targetContext,
      });
      if (get().connectionAttemptId !== attemptId) {
        return;
      }
      set({
        currentContext: info.context || targetContext,
        isConnected: true,
        isLoading: false,
        isAuthenticating: false,
        pendingContext: null,
      });
    } catch (error) {
      if (get().connectionAttemptId !== attemptId) {
        return;
      }
      set({
        error: String(error),
        errorContext: targetContext,
        isLoading: false,
        isAuthenticating: false,
        isConnected: false,
        pendingContext: null,
      });
    }
  },

  disconnect: async () => {
    const { currentContext } = get();
    if (currentContext) {
      try {
        await invoke("disconnect_cluster", { context: currentContext });
      } catch (error) {
        console.error("Error disconnecting:", error);
      }
    }
    set({
      isConnected: false,
      currentContext: null,
      pendingContext: null,
      error: null,
      errorContext: null,
    });
  },
}));
