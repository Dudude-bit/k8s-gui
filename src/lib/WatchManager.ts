/**
 * WatchManager - Singleton manager for Kubernetes Watch API subscriptions
 *
 * Provides centralized management of watch subscriptions to prevent duplicate watches.
 * Uses reference counting to automatically start/stop watches based on subscriber count.
 */

import { listen, UnlistenFn } from "@tauri-apps/api/event";
import * as commands from "@/generated/commands";
import type { WatchInfo } from "@/generated/types";
import { toKind, type ResourceKind } from "@/lib/resource-types";

/** Watch event payload from backend */
export interface WatchEventPayload {
    watch_id: string;
    event_type: "ADDED" | "MODIFIED" | "DELETED";
    resource: Record<string, unknown>;
}

/** Callback for watch events */
export type WatchCallback = (event: WatchEventPayload) => void;

/** Watch key combining resourceType and namespace */
type WatchKey = string;

/** Subscription info for a watch */
interface WatchSubscription {
    watchId: string | null;
    resourceType: ResourceKind;
    namespace: string | null;
    labelSelector?: string;
    callbacks: Set<WatchCallback>;
    startPromise: Promise<void> | null;
    error: Error | null;
}

/**
 * Singleton WatchManager handles all watch subscriptions.
 * Multiple components can subscribe to the same watch without creating duplicates.
 */
class WatchManagerClass {
    private static instance: WatchManagerClass | null = null;
    private subscriptions = new Map<WatchKey, WatchSubscription>();
    private unlistenFn: UnlistenFn | null = null;
    private isListenerSetup = false;

    private constructor() {
        // Private constructor for singleton
    }

    /** Get the singleton instance */
    static getInstance(): WatchManagerClass {
        if (!WatchManagerClass.instance) {
            WatchManagerClass.instance = new WatchManagerClass();
        }
        return WatchManagerClass.instance;
    }

    /** Generate a unique key for a watch subscription */
    private getWatchKey(
        resourceType: ResourceKind,
        namespace: string | null,
        labelSelector?: string
    ): WatchKey {
        return `${resourceType}:${namespace ?? "all"}:${labelSelector ?? ""}`;
    }

    /** Setup global event listener (once) */
    private async setupListener(): Promise<void> {
        if (this.isListenerSetup) return;
        this.isListenerSetup = true;

        try {
            this.unlistenFn = await listen<WatchEventPayload>(
                "watch-event",
                (event) => {
                    this.handleWatchEvent(event.payload);
                }
            );
        } catch (err) {
            console.error("Failed to setup watch event listener:", err);
            this.isListenerSetup = false;
        }
    }

    /** Handle incoming watch event and forward to subscribers */
    private handleWatchEvent(payload: WatchEventPayload): void {
        // Find subscription by watchId
        for (const [, subscription] of this.subscriptions) {
            if (subscription.watchId === payload.watch_id) {
                // Forward to all callbacks
                for (const callback of subscription.callbacks) {
                    try {
                        callback(payload);
                    } catch (err) {
                        console.error("Error in watch callback:", err);
                    }
                }
                break;
            }
        }
    }

    /**
     * Subscribe to watch events for a resource type
     * Accepts resource type in any format (Kind or plural).
     * Returns an unsubscribe function.
     */
    async subscribe(
        resourceType: string,
        namespace: string | null,
        callback: WatchCallback,
        labelSelector?: string
    ): Promise<() => void> {
        // Ensure listener is setup
        await this.setupListener();

        // Normalize resource type to Kind format
        const normalizedType = toKind(resourceType);
        if (!normalizedType) {
            console.error(`[WatchManager] Unknown resource type: ${resourceType}`);
            return () => { };
        }

        const key = this.getWatchKey(normalizedType, namespace, labelSelector);
        let subscription = this.subscriptions.get(key);

        if (!subscription) {
            // Create new subscription
            subscription = {
                watchId: null,
                resourceType: normalizedType,
                namespace,
                labelSelector,
                callbacks: new Set(),
                startPromise: null,
                error: null,
            };
            this.subscriptions.set(key, subscription);
        }

        // Add callback first (before any async operations)
        subscription.callbacks.add(callback);

        // Start watch if not already started
        if (!subscription.watchId && !subscription.startPromise) {
            const sub = subscription; // Capture for closure
            // Create promise that other subscribers can wait on
            subscription.startPromise = (async () => {
                try {
                    // Use Kind for backend (unification)
                    const watchId = await commands.startWatch(
                        normalizedType,
                        namespace,
                        labelSelector ?? null
                    );
                    sub.watchId = watchId;
                    sub.error = null;
                    console.debug(
                        `[WatchManager] Started watch ${watchId} for ${key} (${sub.callbacks.size} subscribers)`
                    );
                } catch (err) {
                    sub.error = err instanceof Error ? err : new Error(String(err));
                    console.error(`[WatchManager] Failed to start watch for ${key}:`, err);
                }
            })();
        }

        // Wait for watch to start if it's in progress
        if (subscription.startPromise) {
            await subscription.startPromise;
        }

        // Return unsubscribe function
        return () => {
            this.unsubscribe(key, callback);
        };
    }

    /** Unsubscribe a callback from a watch */
    private async unsubscribe(key: WatchKey, callback: WatchCallback): Promise<void> {
        const subscription = this.subscriptions.get(key);
        if (!subscription) return;

        subscription.callbacks.delete(callback);

        // If no more subscribers, stop the watch
        if (subscription.callbacks.size === 0) {
            if (subscription.watchId) {
                try {
                    await commands.stopWatch(subscription.watchId);
                    console.debug(
                        `[WatchManager] Stopped watch ${subscription.watchId} for ${key}`
                    );
                } catch (err) {
                    console.warn(`[WatchManager] Failed to stop watch:`, err);
                }
            }
            this.subscriptions.delete(key);
        }
    }

    /** Get subscription info (for debugging) */
    getSubscriptionInfo(): Map<string, { watchId: string | null; subscriberCount: number }> {
        const info = new Map<string, { watchId: string | null; subscriberCount: number }>();
        for (const [key, sub] of this.subscriptions) {
            info.set(key, {
                watchId: sub.watchId,
                subscriberCount: sub.callbacks.size,
            });
        }
        return info;
    }

    /** Check if a watch is active for a key */
    isWatching(
        resourceType: string,
        namespace: string | null,
        labelSelector?: string
    ): boolean {
        const normalizedType = toKind(resourceType);
        if (!normalizedType) return false;
        const key = this.getWatchKey(normalizedType, namespace, labelSelector);
        const subscription = this.subscriptions.get(key);
        return subscription?.watchId != null;
    }

    /** Stop all watches and cleanup */
    async cleanup(): Promise<void> {
        for (const [key, subscription] of this.subscriptions) {
            if (subscription.watchId) {
                try {
                    await commands.stopWatch(subscription.watchId);
                } catch (err) {
                    console.warn(`Failed to stop watch for ${key}:`, err);
                }
            }
        }
        this.subscriptions.clear();

        if (this.unlistenFn) {
            this.unlistenFn();
            this.unlistenFn = null;
        }
        this.isListenerSetup = false;
    }
}

/** Global WatchManager instance */
export const WatchManager = WatchManagerClass.getInstance();

/**
 * List all active watches (for debugging)
 */
export async function listActiveWatches(): Promise<WatchInfo[]> {
    return commands.listActiveWatches();
}
