import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";

import { commands } from "@/lib/commands";

/** Operation tag — mirrors backend `WatchOp`. */
type WatchOp = "applied" | "deleted" | "restarted" | "failed";

interface ResourceEventPayload<T> {
  stream_id: string;
  op: WatchOp;
  /** `null` on `restarted` and `failed`. */
  resource: T | null;
  /** Set on `failed` — backend's error description. `null` for every
   *  other op. */
  error: string | null;
}

interface UseResourceWatchOptions {
  /**
   * `true` once dependencies are ready (current namespace, etc.).
   * The hook short-circuits and does nothing while `false`.
   */
  enabled: boolean;
  /**
   * Async subscription factory. Returns a stream id; the hook owns
   * the rest of the lifecycle (listen + gate release + unsubscribe).
   */
  subscribe: () => Promise<string>;
  /** TanStack Query cache key the watch should keep up to date. */
  queryKey: QueryKey;
  /**
   * Called when the backend emits a `failed` event — typically RBAC
   * `watch` denial or a persistent network problem. The cache is NOT
   * mutated for failed events; the consumer decides what to do
   * (show a toast, fall back to polling, etc.).
   */
  onError?: (error: string) => void;
  /**
   * Called once when a non-failed event arrives after a failed one —
   * the watcher recovered. Consumers use this to flip their
   * watchFailed state back to false, which stops the polling
   * fallback and reverts to pure-watch updates.
   */
  onRecovered?: () => void;
}

/**
 * Subscribes to a backend resource watch, listens for
 * `resource-event` Tauri events, and updates the TanStack Query
 * cache directly. Replaces 2-second polling on the migrated list.
 *
 * Same deferred-start handshake as `useGenericTerminalSession` and
 * `useLogStream`: the hook calls `commands.resourceWatchSubscribed`
 * only after `listen()` has resolved, so the very first
 * `applied`/`restarted` events from the backend cannot land in the
 * void.
 */
export function useResourceWatch<
  T extends { name: string; namespace?: string | null },
>({
  enabled,
  subscribe,
  queryKey,
  onError,
  onRecovered,
}: UseResourceWatchOptions) {
  const queryClient = useQueryClient();
  // Latest callbacks captured via refs so flipping a useState in
  // either callback doesn't tear down the subscription.
  const onErrorRef = useRef(onError);
  const onRecoveredRef = useRef(onRecovered);
  useEffect(() => {
    onErrorRef.current = onError;
    onRecoveredRef.current = onRecovered;
  }, [onError, onRecovered]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let streamId: string | null = null;
    let unlisten: (() => void) | null = null;
    // Tracks whether the most recent stream state was a failure so a
    // following non-failed event can fire `onRecovered` exactly once
    // per failure→recovery transition (instead of on every successful
    // event).
    let inFailedState = false;

    const teardown = async () => {
      active = false;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
      if (streamId) {
        const id = streamId;
        streamId = null;
        try {
          await commands.unsubscribeResourceWatch(id);
        } catch (err) {
          console.error("Failed to unsubscribe resource watch:", err);
        }
      }
    };

    (async () => {
      try {
        const id = await subscribe();
        if (!active) {
          await commands.unsubscribeResourceWatch(id).catch(() => {});
          return;
        }
        streamId = id;

        const off = await listen<ResourceEventPayload<T>>(
          "resource-event",
          (event) => {
            const payload = event.payload;
            if (payload.stream_id !== id) return;
            if (payload.op === "failed") {
              inFailedState = true;
              onErrorRef.current?.(payload.error ?? "Resource watch failed");
              return;
            }
            if (inFailedState) {
              inFailedState = false;
              onRecoveredRef.current?.();
            }
            applyEvent<T>(queryClient, queryKey, payload);
          }
        );

        if (!active) {
          off();
          return;
        }
        unlisten = off;

        // Listener installed — release the backend gate. Failure here
        // means the session was already torn down (race with cleanup);
        // surface to the console but don't crash.
        try {
          await commands.resourceWatchSubscribed(id);
        } catch (err) {
          if (active) {
            console.error("Failed to subscribe resource watch:", err);
          }
        }
      } catch (err) {
        if (active) {
          console.error("Failed to start resource watch:", err);
        }
      }
    })();

    return () => {
      void teardown();
    };
    // queryKey is intentionally compared by reference here. Consumers
    // pass a stable, memoised key (queryKeys.resources(...) called
    // inside a useMemo) — when the underlying namespace/kind changes
    // the key reference changes too, which is correct: the watch
    // belongs to that key and must re-subscribe.
  }, [enabled, subscribe, queryClient, queryKey]);
}

function applyEvent<T extends { name: string; namespace?: string | null }>(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: QueryKey,
  payload: ResourceEventPayload<T>
) {
  if (payload.op === "restarted") {
    // The watcher resync drops everything before re-emitting. Clear
    // the cache so the upcoming `applied` burst has a clean slate
    // and stale entries don't linger.
    queryClient.setQueryData<T[]>(queryKey, []);
    return;
  }

  const incoming = payload.resource;
  if (!incoming) return;

  queryClient.setQueryData<T[]>(queryKey, (prev) => {
    const list = prev ?? [];
    const matches = (item: T) =>
      item.name === incoming.name &&
      (item.namespace ?? null) === (incoming.namespace ?? null);

    if (payload.op === "deleted") {
      return list.filter((item) => !matches(item));
    }

    // applied — replace existing or append.
    const idx = list.findIndex(matches);
    if (idx === -1) return [...list, incoming];
    const next = list.slice();
    next[idx] = incoming;
    return next;
  });
}
