import { describe, expect, it } from "vitest";
import { decideShadowGate } from "@/workers/regression-gate";

describe("decideShadowGate (mutation promote)", () => {
  const improving = {
    canaryDelta: 0,
    corpusDelta: 0.1,
    targetDelta: 0.2,
  };

  it("promotes only when canaryPassK is true and deltas allow", () => {
    expect(decideShadowGate({ ...improving, canaryPassK: true })).toBe("promoted");
  });

  it("blocks promote when canaryPassK is false (hard scorers flaky under pass^k)", () => {
    expect(decideShadowGate({ ...improving, canaryPassK: false })).toBe(
      "rejected_pass_k"
    );
  });

  it("blocks promote when canaryPassK is missing (fail closed)", () => {
    expect(decideShadowGate({ ...improving })).toBe("rejected_pass_k");
  });

  it("rejects canary regression even when pass^k holds", () => {
    expect(
      decideShadowGate({
        canaryDelta: -0.1,
        corpusDelta: 0.1,
        targetDelta: 0.2,
        canaryPassK: true,
      })
    ).toBe("rejected_canary");
  });

  it("rejects corpus regression", () => {
    expect(
      decideShadowGate({
        canaryDelta: 0,
        corpusDelta: -0.05,
        targetDelta: 0.2,
        canaryPassK: true,
      })
    ).toBe("rejected_regression");
  });

  it("rejects no target improvement", () => {
    expect(
      decideShadowGate({
        canaryDelta: 0,
        corpusDelta: 0,
        targetDelta: 0,
        canaryPassK: true,
      })
    ).toBe("rejected_no_improvement");
  });
});
