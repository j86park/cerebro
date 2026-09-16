import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    DATABASE_URL: "postgresql://localhost:5432/cerebro_test",
    REDIS_URL: "redis://localhost:6379",
    NODE_ENV: "test",
    ONLINE_JUDGE_SAMPLE_RATE: 0.05,
    OPENROUTER_API_KEY: "dev-openrouter-key",
  },
  getModel: vi.fn(),
}));

describe("online judge sampling", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shouldSampleOnlineJudge respects rate 0 and max 0.05", async () => {
    const { shouldSampleOnlineJudge } = await import(
      "@/lib/evals/online-judge-sample"
    );
    expect(shouldSampleOnlineJudge({ rate: 0, random: () => 0 })).toBe(false);
    expect(shouldSampleOnlineJudge({ rate: 0.05, random: () => 0.049 })).toBe(
      true,
    );
    expect(shouldSampleOnlineJudge({ rate: 0.05, random: () => 0.05 })).toBe(
      false,
    );
    expect(() => shouldSampleOnlineJudge({ rate: 0.2 })).toThrow();
  });

  it("buildOnlineJudgeJobId is BullMQ-legal 3-segment form", async () => {
    const { buildOnlineJudgeJobId } = await import(
      "@/lib/evals/online-judge-sample"
    );
    const id = buildOnlineJudgeJobId("scan:CLT-1:2026-03-14");
    expect(id.split(":")).toHaveLength(3);
    expect(id.startsWith("oj:")).toBe(true);
  });

  it("processOnlineJudgeJob under DRY_RUN logs without calling judge LLM", async () => {
    const logDecision = vi.fn().mockResolvedValue({ id: "dec-1" });
    vi.doMock("@/lib/db/vault-service", () => ({
      VaultService: class {
        logDecision = logDecision;
      },
    }));
    const judgeSpy = vi.fn();
    vi.doMock("@/evals/scorers/reasoningQuality", () => ({
      judgeReasoningQuality: judgeSpy,
    }));

    const { processOnlineJudgeJob } = await import(
      "@/workers/online-judge.worker"
    );
    const result = await processOnlineJudgeJob({
      clientId: "CLT-OJ",
      agentType: "COMPLIANCE",
      sourceJobId: "scan:CLT-OJ:2026-03-14",
      traceId: "abc123",
      agentName: "complianceAgent",
      stage: 2,
      reasoningText: "Escalated after expiry review",
      toolNames: ["getActionHistory", "sendAdvisorAlert"],
    });

    expect(result).toEqual({ outcome: "DRY_RUN", skippedLlm: true });
    expect(judgeSpy).not.toHaveBeenCalled();
    expect(logDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "DRY_RUN",
        metadata: expect.objectContaining({
          kind: "online_judge_sample",
        }),
      }),
    );
  });
});
