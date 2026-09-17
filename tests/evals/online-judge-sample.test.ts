import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    DATABASE_URL: "postgresql://localhost:5432/cerebro_test",
    REDIS_URL: "redis://localhost:6379",
    NODE_ENV: "test",
    ONLINE_JUDGE_SAMPLE_RATE: 0.05,
    ONLINE_JUDGE_FAILURE_SAMPLE_RATE: 0.25,
    OPENROUTER_API_KEY: "dev-openrouter-key",
  },
  getModel: vi.fn(),
}));

describe("online judge dual-stream sampling (cheap-eval PR5)", () => {
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

  it("selectOnlineJudgeSample prefers failure_weighted on failure signals", async () => {
    const { selectOnlineJudgeSample } = await import(
      "@/lib/evals/online-judge-sample"
    );
    const hit = selectOnlineJudgeSample({
      isFailureSignal: true,
      failureRate: 0.5,
      uniformRate: 0,
      random: () => 0.1,
    });
    expect(hit).toEqual({ sample: true, stream: "failure_weighted" });

    const miss = selectOnlineJudgeSample({
      isFailureSignal: true,
      failureRate: 0.1,
      uniformRate: 0,
      random: () => 0.5,
    });
    expect(miss).toEqual({ sample: false });
  });

  it("selectOnlineJudgeSample uses uniform stream without failure signal", async () => {
    const { selectOnlineJudgeSample } = await import(
      "@/lib/evals/online-judge-sample"
    );
    const hit = selectOnlineJudgeSample({
      isFailureSignal: false,
      uniformRate: 0.05,
      failureRate: 1,
      random: () => 0.01,
    });
    expect(hit).toEqual({ sample: true, stream: "uniform" });
    expect(() =>
      selectOnlineJudgeSample({ uniformRate: 0.2 }),
    ).toThrow();
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
    const stageSpy = vi.fn().mockResolvedValue({
      staged: false,
      reason: "not_promote_candidate",
    });
    vi.doMock("@/evals/golden/promote-queue", () => ({
      stagePromoteCandidateFromOnlineSample: stageSpy,
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
      stream: "uniform",
      isFailureSignal: false,
    });

    expect(result).toEqual({
      outcome: "DRY_RUN",
      skippedLlm: true,
      promoteQueued: false,
      candidateId: undefined,
    });
    expect(judgeSpy).not.toHaveBeenCalled();
    expect(stageSpy).toHaveBeenCalled();
    expect(logDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "DRY_RUN",
        metadata: expect.objectContaining({
          kind: "online_judge_sample",
          stream: "uniform",
        }),
      }),
    );
  });

  it("processOnlineJudgeJob stages promote queue for failure_weighted under DRY_RUN", async () => {
    const logDecision = vi.fn().mockResolvedValue({ id: "dec-2" });
    vi.doMock("@/lib/db/vault-service", () => ({
      VaultService: class {
        logDecision = logDecision;
      },
    }));
    vi.doMock("@/evals/scorers/reasoningQuality", () => ({
      judgeReasoningQuality: vi.fn(),
    }));
    const stageSpy = vi.fn().mockResolvedValue({
      staged: true,
      candidateId: "cand-oj-fail",
      filePath: "/tmp/cand.json",
    });
    vi.doMock("@/evals/golden/promote-queue", () => ({
      stagePromoteCandidateFromOnlineSample: stageSpy,
    }));

    const { processOnlineJudgeJob } = await import(
      "@/workers/online-judge.worker"
    );
    const result = await processOnlineJudgeJob({
      clientId: "CLT-FAIL",
      agentType: "ONBOARDING",
      sourceJobId: "scan:CLT-FAIL:2026-03-14",
      traceId: "deadbeef",
      agentName: "onboardingAgent",
      reasoningText: "Agent run failed: boom",
      toolNames: [],
      stream: "failure_weighted",
      isFailureSignal: true,
    });

    expect(result.promoteQueued).toBe(true);
    expect(result.candidateId).toBe("cand-oj-fail");
    expect(result.skippedLlm).toBe(true);
    expect(stageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: "failure_weighted",
        isFailureSignal: true,
      }),
    );
  });
});
