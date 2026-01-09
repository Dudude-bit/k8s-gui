/**
 * Global Tick Store for Real-Time Updates
 *
 * Provides a centralized timing mechanism for components that need
 * periodic re-renders without server fetches. Uses useSyncExternalStore
 * for efficient React integration.
 *
 * Channels:
 * - fast: 1s interval (for ages showing seconds)
 * - medium: 10s interval (for ages showing minutes)
 * - slow: 60s interval (for ages showing hours/days, countdowns)
 *
 * @module stores/tickStore
 */

export type TickChannel = "fast" | "medium" | "slow";

interface ChannelState {
  tick: number;
  interval: number;
  timerId: ReturnType<typeof setInterval> | null;
  subscribers: Set<() => void>;
}

interface TickStoreState {
  channels: Record<TickChannel, ChannelState>;
}

const CHANNEL_INTERVALS: Record<TickChannel, number> = {
  fast: 1000,
  medium: 10000,
  slow: 60000,
};

/**
 * Create the tick store singleton
 */
function createTickStore() {
  const state: TickStoreState = {
    channels: {
      fast: {
        tick: 0,
        interval: CHANNEL_INTERVALS.fast,
        timerId: null,
        subscribers: new Set(),
      },
      medium: {
        tick: 0,
        interval: CHANNEL_INTERVALS.medium,
        timerId: null,
        subscribers: new Set(),
      },
      slow: {
        tick: 0,
        interval: CHANNEL_INTERVALS.slow,
        timerId: null,
        subscribers: new Set(),
      },
    },
  };

  /**
   * Start the timer for a channel if not already running
   */
  function startChannel(channel: TickChannel) {
    const channelState = state.channels[channel];
    if (channelState.timerId !== null) return;

    channelState.timerId = setInterval(() => {
      channelState.tick++;
      // Notify all subscribers
      channelState.subscribers.forEach((callback) => callback());
    }, channelState.interval);
  }

  /**
   * Stop the timer for a channel if no subscribers
   */
  function stopChannel(channel: TickChannel) {
    const channelState = state.channels[channel];
    if (channelState.timerId === null) return;
    if (channelState.subscribers.size > 0) return;

    clearInterval(channelState.timerId);
    channelState.timerId = null;
  }

  /**
   * Subscribe to a channel's ticks
   * @returns Unsubscribe function
   */
  function subscribe(channel: TickChannel, callback: () => void): () => void {
    const channelState = state.channels[channel];
    channelState.subscribers.add(callback);
    startChannel(channel);

    return () => {
      channelState.subscribers.delete(callback);
      // Use setTimeout to avoid stopping during render
      setTimeout(() => stopChannel(channel), 0);
    };
  }

  /**
   * Get current tick count for a channel (for useSyncExternalStore)
   */
  function getSnapshot(channel: TickChannel): number {
    return state.channels[channel].tick;
  }

  /**
   * Get server snapshot (for SSR/hydration safety)
   */
  function getServerSnapshot(_channel: TickChannel): number {
    return 0;
  }

  return {
    subscribe,
    getSnapshot,
    getServerSnapshot,
  };
}

// Export singleton instance
export const tickStore = createTickStore();
