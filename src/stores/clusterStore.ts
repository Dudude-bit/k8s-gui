/**
 * Cluster Store
 *
 * Manages Kubernetes cluster connection state including contexts,
 * namespaces, and connection status. Handles loading contexts from
 * kubeconfig and connecting/disconnecting from clusters.
 *
 * @module stores/clusterStore
 */

import { create } from "zustand";

import type { ClusterContext } from "@/types/kubernetes";
import { normalizeTauriError } from "@/lib/error-utils";
import { commands } from "@/lib/commands";

/** Cluster store state and actions */
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
      const contextInfos = await commands.listContexts();
      // Convert ContextInfo[] to ClusterContext[]
      const contexts: ClusterContext[] = contextInfos.map((ctx) => ({
        name: ctx.name,
        cluster: ctx.cluster,
        user: ctx.user,
        namespace: ctx.namespace ?? undefined,
        is_current: ctx.is_current,
      }));
      const currentContext = await commands.getCurrentContext();
      set({ contexts, currentContext, isLoading: false });
    } catch (error) {
      set({
        error: normalizeTauriError(error),
        isLoading: false,
      });
    }
  },

  switchContext: async (context: string) => {
    const previousContext = get().currentContext;
    const nextNamespace =
      previousContext && previousContext !== context
        ? ""
        : get().currentNamespace;
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
    set({ currentNamespace: namespace, error: null, errorContext: null });
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
      commands.disconnectCluster(previousContext).catch(() => {
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
      const info = await commands.connectCluster(targetContext);
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
      // Normalize error message - Tauri errors can be objects
      const errorMessage = normalizeTauriError(error);
      set({
        error: errorMessage,
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
        await commands.disconnectCluster(currentContext);
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
