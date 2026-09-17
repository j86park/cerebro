import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("getAgentMaxSteps", () => {
  const original = process.env.AGENT_MAX_STEPS;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AGENT_MAX_STEPS;
    } else {
      process.env.AGENT_MAX_STEPS = original;
    }
  });

  it("defaults to 12 and clamps trajectory overrides", async () => {
    delete process.env.AGENT_MAX_STEPS;
    const { getAgentMaxSteps, env } = await import("@/lib/config");
    expect(env.AGENT_MAX_STEPS).toBe(12);
    expect(getAgentMaxSteps()).toBe(12);
    expect(getAgentMaxSteps(10)).toBe(10);
    expect(getAgentMaxSteps(16)).toBe(12);
  });

  it("allows raising the cap via AGENT_MAX_STEPS for multi-issue (≤32)", async () => {
    process.env.AGENT_MAX_STEPS = "16";
    const { getAgentMaxSteps, env } = await import("@/lib/config");
    expect(env.AGENT_MAX_STEPS).toBe(16);
    expect(getAgentMaxSteps(16)).toBe(16);
    expect(getAgentMaxSteps(20)).toBe(16);
  });
});
