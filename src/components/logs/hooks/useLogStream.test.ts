import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ----- Mocks -----

// Order tracking shared between the listen mock and the
// logStreamSubscribed mock so we can assert the contract: the listener
// for "log-line" MUST be installed before logStreamSubscribed is called.

let callCounter = 0;
const listenCalls: Array<{ event: string; index: number }> = [];
const subscribedCalls: Array<{ streamId: string; index: number }> = [];

// Captured per-event so tests can synthetically fire log-line payloads
// at the registered handler.
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

vi.mock("@/lib/commands", () => ({
  commands: {
    streamPodLogs: vi.fn(async () => "stream-id-1"),
    stopLogStream: vi.fn(async () => undefined),
    logStreamSubscribed: vi.fn(async (streamId: string) => {
      subscribedCalls.push({ streamId, index: callCounter++ });
    }),
  },
}));

vi.mock("@/lib/error-utils", () => ({
  normalizeTauriError: (err: unknown) => String(err),
}));

import { useLogStream } from "./useLogStream";

const baseProps = {
  podName: "p",
  namespace: "n",
  container: "c",
  tailLines: 100,
};

describe("useLogStream deferred-start handshake", () => {
  beforeEach(() => {
    listenCalls.length = 0;
    subscribedCalls.length = 0;
    callCounter = 0;
    for (const k of Object.keys(listeners)) delete listeners[k];
    vi.clearAllMocks();
  });

  it("registers log-line listener before calling logStreamSubscribed", async () => {
    renderHook(() => useLogStream(baseProps));

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    const lineCall = listenCalls.find((c) => c.event === "log-line");
    expect(lineCall, "log-line listener was never registered").toBeDefined();
    expect(lineCall!.index).toBeLessThan(subscribedCalls[0].index);
  });

  it("calls logStreamSubscribed with the streamId returned from streamPodLogs", async () => {
    renderHook(() => useLogStream(baseProps));

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    expect(subscribedCalls[0].streamId).toBe("stream-id-1");
  });
});

// Helper: build a log-line event payload of the shape the backend emits.
function logEvent(streamId: string, message: string) {
  return {
    payload: {
      stream_id: streamId,
      line: message,
      pod: "p",
      container: "c",
      message,
      timestamp: null,
      level: null,
      format: null,
      fields: null,
      raw: message,
    },
  };
}

describe("useLogStream stable line ids", () => {
  beforeEach(() => {
    listenCalls.length = 0;
    subscribedCalls.length = 0;
    callCounter = 0;
    for (const k of Object.keys(listeners)) delete listeners[k];
    vi.clearAllMocks();
  });

  it("assigns a unique, monotonically increasing id to each log line", async () => {
    const { result } = renderHook(() => useLogStream(baseProps));

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    const handler = listeners["log-line"];
    expect(handler, "log-line handler captured").toBeDefined();

    handler!(logEvent("stream-id-1", "first"));
    handler!(logEvent("stream-id-1", "second"));
    handler!(logEvent("stream-id-1", "third"));

    await waitFor(() => {
      expect(result.current.logs).toHaveLength(3);
    });

    const ids = result.current.logs.map((l) => l.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBeLessThan(ids[1]);
    expect(ids[1]).toBeLessThan(ids[2]);
  });

  it("preserves ids across renders so React keys stay stable", async () => {
    const { result } = renderHook(() => useLogStream(baseProps));

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    const handler = listeners["log-line"]!;
    handler(logEvent("stream-id-1", "alpha"));
    handler(logEvent("stream-id-1", "beta"));

    await waitFor(() => {
      expect(result.current.logs).toHaveLength(2);
    });

    const idsBefore = result.current.logs.map((l) => l.id);

    // Append more logs — the existing entries' ids must not change.
    handler(logEvent("stream-id-1", "gamma"));

    await waitFor(() => {
      expect(result.current.logs).toHaveLength(3);
    });

    expect(result.current.logs[0].id).toBe(idsBefore[0]);
    expect(result.current.logs[1].id).toBe(idsBefore[1]);
  });
});
