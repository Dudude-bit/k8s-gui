import { describe, it, expect } from "vitest";
import {
  getThresholds,
  getUtilizationLevel,
  calculatePercentage,
  calculateMetricState,
} from "./metrics-utils";

describe("getThresholds", () => {
  it("returns CPU thresholds (more permissive — throttling is tolerable)", () => {
    expect(getThresholds("cpu")).toEqual({ warning: 80, critical: 95 });
  });

  it("returns memory thresholds (stricter — OOMKill is dangerous)", () => {
    expect(getThresholds("memory")).toEqual({ warning: 70, critical: 85 });
  });
});

describe("getUtilizationLevel", () => {
  it("returns normal for null percentage", () => {
    expect(getUtilizationLevel(null, "cpu")).toBe("normal");
    expect(getUtilizationLevel(null, "memory")).toBe("normal");
  });

  it("CPU thresholds: 79=normal, 80=warning, 94=warning, 95=critical", () => {
    expect(getUtilizationLevel(79, "cpu")).toBe("normal");
    expect(getUtilizationLevel(80, "cpu")).toBe("warning");
    expect(getUtilizationLevel(94, "cpu")).toBe("warning");
    expect(getUtilizationLevel(95, "cpu")).toBe("critical");
  });

  it("memory thresholds: 69=normal, 70=warning, 84=warning, 85=critical", () => {
    expect(getUtilizationLevel(69, "memory")).toBe("normal");
    expect(getUtilizationLevel(70, "memory")).toBe("warning");
    expect(getUtilizationLevel(84, "memory")).toBe("warning");
    expect(getUtilizationLevel(85, "memory")).toBe("critical");
  });

  it("classifies any value above critical as critical", () => {
    expect(getUtilizationLevel(150, "memory")).toBe("critical");
    expect(getUtilizationLevel(999, "cpu")).toBe("critical");
  });
});

describe("calculatePercentage", () => {
  it("prefers limit over request when both available", () => {
    const r = calculatePercentage(500, 250, 1000);
    expect(r.base).toBe("limit");
    expect(r.percentage).toBe(50);
  });

  it("falls back to request when limit absent", () => {
    const r = calculatePercentage(500, 250, null);
    expect(r.base).toBe("request");
    expect(r.percentage).toBe(200); // 500 / 250 * 100
  });

  it("returns null base when neither is set", () => {
    expect(calculatePercentage(500, null, null)).toEqual({
      percentage: null,
      base: null,
    });
    expect(calculatePercentage(500, 0, 0)).toEqual({
      percentage: null,
      base: null,
    });
  });

  it("clamps to 100 against limit (kubelet enforces it — > 100 not possible)", () => {
    const r = calculatePercentage(2000, null, 1000);
    expect(r.percentage).toBe(100);
    expect(r.base).toBe("limit");
  });

  it("allows up to 999 against request (overcommit is real, just bounded)", () => {
    expect(calculatePercentage(50_000, 1000, null).percentage).toBe(999);
    expect(calculatePercentage(2500, 1000, null).percentage).toBe(250);
  });
});

describe("calculateMetricState", () => {
  it("returns null when usage is null/undefined", () => {
    expect(calculateMetricState("cpu", null, 250, 1000)).toBeNull();
    expect(calculateMetricState("memory", null, null, null)).toBeNull();
  });

  it("CPU with limit: normal level under threshold", () => {
    const s = calculateMetricState("cpu", 500, 250, 1000);
    expect(s).not.toBeNull();
    expect(s!.value).toBe(500);
    expect(s!.percentage).toBe(50);
    expect(s!.base).toBe("limit");
    expect(s!.level).toBe("normal");
    expect(s!.hasLimit).toBe(true);
    expect(s!.hasRequest).toBe(true);
  });

  it("memory overcommit against request flags critical", () => {
    // 400Mi used vs 256Mi requested, no limit -> 156% of request, memory critical >= 85
    const s = calculateMetricState(
      "memory",
      400 * 1024 * 1024,
      256 * 1024 * 1024,
      null
    );
    expect(s).not.toBeNull();
    expect(s!.percentage).toBeGreaterThan(100);
    expect(s!.base).toBe("request");
    expect(s!.level).toBe("critical");
    expect(s!.hasLimit).toBe(false);
    expect(s!.hasRequest).toBe(true);
  });

  it("CPU at limit: 95% triggers critical", () => {
    const s = calculateMetricState("cpu", 950, 500, 1000);
    expect(s!.percentage).toBe(95);
    expect(s!.level).toBe("critical");
  });

  it("no request and no limit: percentage null, level normal", () => {
    const s = calculateMetricState("memory", 100 * 1024 * 1024, null, null);
    expect(s!.percentage).toBeNull();
    expect(s!.base).toBeNull();
    expect(s!.level).toBe("normal");
    expect(s!.hasLimit).toBe(false);
    expect(s!.hasRequest).toBe(false);
  });
});
