import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ----- Mocks -----

const listenCalls: Array<{ event: string; index: number }> = [];
let callCounter = 0;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string) => {
    listenCalls.push({ event, index: callCounter++ });
    return () => {};
  }),
}));

const subscribedCalls: Array<{ sessionId: string; index: number }> = [];

vi.mock("@/lib/commands", () => ({
  commands: {
    terminalSubscribed: vi.fn(async (sessionId: string) => {
      subscribedCalls.push({ sessionId, index: callCounter++ });
    }),
    terminalInput: vi.fn(async () => undefined),
    terminalResize: vi.fn(async () => undefined),
    closeTerminal: vi.fn(async () => undefined),
  },
}));

import { useGenericTerminalSession } from "./useGenericTerminalSession";

// ----- Tests -----

describe("useGenericTerminalSession deferred-start handshake", () => {
  beforeEach(() => {
    listenCalls.length = 0;
    subscribedCalls.length = 0;
    callCounter = 0;
    vi.clearAllMocks();
  });

  it("registers terminal-output listener before calling terminalSubscribed", async () => {
    renderHook(() =>
      useGenericTerminalSession({
        sessionId: "session-1",
      })
    );

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    const outputCall = listenCalls.find((c) => c.event === "terminal-output");
    expect(
      outputCall,
      "terminal-output listener was never registered"
    ).toBeDefined();
    expect(outputCall!.index).toBeLessThan(subscribedCalls[0].index);
  });

  it("registers terminal-closed listener before calling terminalSubscribed", async () => {
    renderHook(() =>
      useGenericTerminalSession({
        sessionId: "session-2",
      })
    );

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    const closedCall = listenCalls.find((c) => c.event === "terminal-closed");
    expect(
      closedCall,
      "terminal-closed listener was never registered"
    ).toBeDefined();
    expect(closedCall!.index).toBeLessThan(subscribedCalls[0].index);
  });

  it("calls terminalSubscribed with the session id passed to the hook", async () => {
    renderHook(() =>
      useGenericTerminalSession({
        sessionId: "session-xyz",
      })
    );

    await waitFor(() => {
      expect(subscribedCalls).toHaveLength(1);
    });

    expect(subscribedCalls[0].sessionId).toBe("session-xyz");
  });

  it("does not call terminalSubscribed when sessionId is null", async () => {
    renderHook(() =>
      useGenericTerminalSession({
        sessionId: null,
      })
    );

    // Give microtasks a chance to flush in case the hook would have called.
    await new Promise((r) => setTimeout(r, 50));

    expect(subscribedCalls).toHaveLength(0);
  });
});
