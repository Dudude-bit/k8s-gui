// Vitest global setup file. Loaded by vitest.config.ts via `setupFiles`.
//
// Runs once per worker before any test file. Registers @testing-library/jest-dom
// matchers and stubs the @tauri-apps/api surface so components that import
// `invoke`, `listen`, `getCurrentWindow`, etc. don't blow up under jsdom (where
// the Tauri runtime isn't present).

import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Default jsdom doesn't ship matchMedia or ResizeObserver — Radix and various
// UI libraries call into them at mount.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
}

// Tauri API mocks — every call returns a resolved promise / no-op listener.
// Individual tests override per-method via `vi.mocked(...)` if they care.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
  convertFileSrc: (path: string) => path,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
  once: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    listen: vi.fn(async () => () => {}),
    emit: vi.fn(async () => {}),
    setTitle: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  }),
}));

afterEach(() => {
  cleanup();
});
