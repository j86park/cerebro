import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

const schema = z.object({ note: z.string().default("") });

function setEnv(overrides: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("T2.1 observational memory scaffold", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("keeps OM off by default (gate unmet)", async () => {
    setEnv({
      AGENT_OBSERVATIONAL_MEMORY: undefined,
      DRY_RUN: "true",
      NODE_ENV: "test",
    });

    const { isObservationalMemoryEnabled } = await import("@/lib/config");
    const { buildAgentMemoryOptions, observationalMemoryDisabledReason } =
      await import("@/lib/memory/buildAgentMemoryOptions");

    expect(isObservationalMemoryEnabled()).toBe(false);
    expect(observationalMemoryDisabledReason()).toMatch(
      /AGENT_OBSERVATIONAL_MEMORY=false/,
    );

    const options = buildAgentMemoryOptions(schema);
    expect(options.lastMessages).toBe(20);
    expect(options.workingMemory.enabled).toBe(true);
    expect(options.observationalMemory).toBeUndefined();
  });

  it("still disables OM under DRY_RUN even when flag is true", async () => {
    setEnv({
      AGENT_OBSERVATIONAL_MEMORY: "true",
      DRY_RUN: "true",
      NODE_ENV: "development",
    });

    const { isObservationalMemoryEnabled } = await import("@/lib/config");
    const { buildAgentMemoryOptions, observationalMemoryDisabledReason } =
      await import("@/lib/memory/buildAgentMemoryOptions");

    expect(isObservationalMemoryEnabled()).toBe(false);
    expect(observationalMemoryDisabledReason()).toMatch(/DRY_RUN/);
    expect(buildAgentMemoryOptions(schema).observationalMemory).toBeUndefined();
  });

  it("still disables OM under NODE_ENV=test when flag is true", async () => {
    setEnv({
      AGENT_OBSERVATIONAL_MEMORY: "true",
      DRY_RUN: "false",
      NODE_ENV: "test",
    });

    const { isObservationalMemoryEnabled } = await import("@/lib/config");
    const { observationalMemoryDisabledReason } = await import(
      "@/lib/memory/buildAgentMemoryOptions"
    );

    expect(isObservationalMemoryEnabled()).toBe(false);
    expect(observationalMemoryDisabledReason()).toMatch(/NODE_ENV=test/);
  });

  it("enables OM config when flag on, not DRY_RUN, not test", async () => {
    setEnv({
      AGENT_OBSERVATIONAL_MEMORY: "true",
      DRY_RUN: "false",
      NODE_ENV: "development",
    });

    const fakeModel = { id: "dev-model-stub" };
    vi.doMock("@/lib/config", async () => {
      const actual = await vi.importActual<typeof import("@/lib/config")>(
        "@/lib/config",
      );
      return {
        ...actual,
        getModel: () => fakeModel,
        isObservationalMemoryEnabled: () => true,
      };
    });

    const { buildAgentMemoryOptions } = await import(
      "@/lib/memory/buildAgentMemoryOptions"
    );
    const options = buildAgentMemoryOptions(schema);
    expect(options.observationalMemory).toEqual({
      model: fakeModel,
      scope: "thread",
    });
  });
});

describe("T2.1 tool-as-subagent stub", () => {
  it("never enables tool-as-subagent fan-out", async () => {
    const { isToolAsSubagentEnabled, runToolAsSubagentSummary } = await import(
      "@/lib/memory/subagentSummaries"
    );

    expect(isToolAsSubagentEnabled()).toBe(false);
    expect(() =>
      runToolAsSubagentSummary({
        clientId: "CLT-001",
        agentDomain: "compliance",
        toolIds: ["getDocumentComplianceStatus"],
        goal: "summarize open issues",
      }),
    ).toThrow(/T2.1 gate unmet/);
  });

  it("validates request shape before throwing", async () => {
    const { runToolAsSubagentSummary } = await import(
      "@/lib/memory/subagentSummaries"
    );

    expect(() =>
      runToolAsSubagentSummary({
        clientId: "",
        agentDomain: "compliance",
        toolIds: [],
        goal: "x",
      } as never),
    ).toThrow();
  });
});
