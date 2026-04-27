import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ----- Mocks -----

// Order tracking shared between the listen mock and the
// logStreamSubscribed mock so we can assert the contract: the listener
// for "log-line" MUST be installed before logStreamSubscribed is called.

let callCounter = 0;
const listenCalls: Array<{ event: string; index: number }> = [];
const subscribedCalls: Array<{ streamId: string; index: number }> = [];

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string) => {
    listenCalls.push({ event, index: callCounter++ });
    return () => {};
  }),
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
