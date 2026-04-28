import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// ----- Mocks -----

let callCounter = 0;
const listenCalls: Array<{ event: string; index: number }> = [];
const subscribedCalls: Array<{ streamId: string; index: number }> = [];

const listeners: Record<
  string,
  ((event: { payload: unknown }) => void) | undefined
> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    async (event: string, handler: (e: { payload: unknown }) => void) => {
      listenCalls.push({ event, index: callCounter++ });
      listeners[event] = handler;
      return () => {
        delete listeners[event];
      };
    }
  ),
}));

const subscribeMock = vi.fn(async () => "stream-cm-1");

vi.mock("@/lib/commands", () => ({
  commands: {
    resourceWatchSubscribed: vi.fn(async (streamId: string) => {
      subscribedCalls.push({ streamId, index: callCounter++ });
    }),
    unsubscribeResourceWatch: vi.fn(async () => undefined),
  },
}));

import { commands } from "@/lib/commands";
import { useResourceWatch } from "./useResourceWatch";

// ----- Test harness -----

type Item = { name: string; namespace?: string | null; data?: number };

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function emit(
  streamId: string,
  op: "applied" | "deleted" | "restarted",
  resource: Item | null
) {
  const handler = listeners["resource-event"];
  if (!handler) throw new Error("resource-event handler not registered");
  handler({
    payload: { stream_id: streamId, op, resource, error: null },
  });
}

function emitFailed(streamId: string, error: string) {
  const handler = listeners["resource-event"];
  if (!handler) throw new Error("resource-event handler not registered");
  handler({
    payload: { stream_id: streamId, op: "failed", resource: null, error },
  });
}

describe("useResourceWatch", () => {
  beforeEach(() => {
    listenCalls.length = 0;
    subscribedCalls.length = 0;
    callCounter = 0;
    for (const k of Object.keys(listeners)) delete listeners[k];
    vi.clearAllMocks();
  });

  it("registers resource-event listener before calling resourceWatchSubscribed", async () => {
    const client = new QueryClient();
    renderHook(
      () =>
        useResourceWatch<Item>({
          enabled: true,
          subscribe: subscribeMock,
          queryKey: ["configmaps", "default"],
        }),
      { wrapper: makeWrapper(client) }
    );

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    const lc = listenCalls.find((c) => c.event === "resource-event");
    expect(lc, "resource-event listener was never registered").toBeDefined();
    expect(lc!.index).toBeLessThan(subscribedCalls[0].index);
  });

  it("does not subscribe while disabled", async () => {
    const client = new QueryClient();
    renderHook(
      () =>
        useResourceWatch<Item>({
          enabled: false,
          subscribe: subscribeMock,
          queryKey: ["configmaps", "default"],
        }),
      { wrapper: makeWrapper(client) }
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(subscribeMock).not.toHaveBeenCalled();
    expect(subscribedCalls).toHaveLength(0);
  });

  it("appends an applied event for an unseen item", async () => {
    const client = new QueryClient();
    client.setQueryData<Item[]>(
      ["configmaps", "default"],
      [{ name: "a", namespace: "default" }]
    );

    renderHook(
      () =>
        useResourceWatch<Item>({
          enabled: true,
          subscribe: subscribeMock,
          queryKey: ["configmaps", "default"],
        }),
      { wrapper: makeWrapper(client) }
    );

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    emit("stream-cm-1", "applied", {
      name: "b",
      namespace: "default",
      data: 1,
    });

    await waitFor(() => {
      const list = client.getQueryData<Item[]>(["configmaps", "default"]);
      expect(list).toHaveLength(2);
    });

    const list = client.getQueryData<Item[]>(["configmaps", "default"])!;
    expect(list.map((i) => i.name)).toEqual(["a", "b"]);
  });

  it("replaces an existing item on applied", async () => {
    const client = new QueryClient();
    client.setQueryData<Item[]>(
      ["configmaps", "default"],
      [{ name: "a", namespace: "default", data: 1 }]
    );

    renderHook(
      () =>
        useResourceWatch<Item>({
          enabled: true,
          subscribe: subscribeMock,
          queryKey: ["configmaps", "default"],
        }),
      { wrapper: makeWrapper(client) }
    );

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    emit("stream-cm-1", "applied", {
      name: "a",
      namespace: "default",
      data: 999,
    });

    await waitFor(() => {
      const list = client.getQueryData<Item[]>(["configmaps", "default"])!;
      expect(list[0].data).toBe(999);
    });

    expect(client.getQueryData<Item[]>(["configmaps", "default"])).toHaveLength(
      1
    );
  });

  it("removes the matching item on deleted", async () => {
    const client = new QueryClient();
    client.setQueryData<Item[]>(
      ["configmaps", "default"],
      [
        { name: "a", namespace: "default" },
        { name: "b", namespace: "default" },
      ]
    );

    renderHook(
      () =>
        useResourceWatch<Item>({
          enabled: true,
          subscribe: subscribeMock,
          queryKey: ["configmaps", "default"],
        }),
      { wrapper: makeWrapper(client) }
    );

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    emit("stream-cm-1", "deleted", { name: "a", namespace: "default" });

    await waitFor(() => {
      const list = client.getQueryData<Item[]>(["configmaps", "default"])!;
      expect(list.map((i) => i.name)).toEqual(["b"]);
    });
  });

  it("clears the cache on restarted", async () => {
    const client = new QueryClient();
    client.setQueryData<Item[]>(
      ["configmaps", "default"],
      [
        { name: "a", namespace: "default" },
        { name: "b", namespace: "default" },
      ]
    );

    renderHook(
      () =>
        useResourceWatch<Item>({
          enabled: true,
          subscribe: subscribeMock,
          queryKey: ["configmaps", "default"],
        }),
      { wrapper: makeWrapper(client) }
    );

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    emit("stream-cm-1", "restarted", null);

    await waitFor(() => {
      const list = client.getQueryData<Item[]>(["configmaps", "default"])!;
      expect(list).toEqual([]);
    });
  });

  it("ignores events for a different stream id", async () => {
    const client = new QueryClient();
    client.setQueryData<Item[]>(
      ["configmaps", "default"],
      [{ name: "a", namespace: "default" }]
    );

    renderHook(
      () =>
        useResourceWatch<Item>({
          enabled: true,
          subscribe: subscribeMock,
          queryKey: ["configmaps", "default"],
        }),
      { wrapper: makeWrapper(client) }
    );

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    // Event from a different stream — must not touch the cache.
    emit("some-other-stream", "deleted", { name: "a", namespace: "default" });

    await new Promise((r) => setTimeout(r, 30));
    expect(client.getQueryData<Item[]>(["configmaps", "default"])).toHaveLength(
      1
    );
  });

  it("calls onError on a failed event without mutating the cache", async () => {
    const client = new QueryClient();
    client.setQueryData<Item[]>(
      ["configmaps", "default"],
      [{ name: "a", namespace: "default" }]
    );
    const onError = vi.fn();

    renderHook(
      () =>
        useResourceWatch<Item>({
          enabled: true,
          subscribe: subscribeMock,
          queryKey: ["configmaps", "default"],
          onError,
        }),
      { wrapper: makeWrapper(client) }
    );

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    emitFailed("stream-cm-1", "watch verb forbidden");

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("watch verb forbidden");
    });

    // Failed events MUST NOT touch the cache. The consumer is the one
    // that decides what to do (toast + re-enable polling, etc.).
    expect(client.getQueryData<Item[]>(["configmaps", "default"])).toEqual([
      { name: "a", namespace: "default" },
    ]);
  });

  it("calls unsubscribeResourceWatch on unmount", async () => {
    const client = new QueryClient();
    const { unmount } = renderHook(
      () =>
        useResourceWatch<Item>({
          enabled: true,
          subscribe: subscribeMock,
          queryKey: ["configmaps", "default"],
        }),
      { wrapper: makeWrapper(client) }
    );

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    unmount();

    await waitFor(() => {
      expect(commands.unsubscribeResourceWatch).toHaveBeenCalledWith(
        "stream-cm-1"
      );
    });
  });
});
