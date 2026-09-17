import { beforeEach, describe, expect, it, vi } from "vitest";

const runAllEvals = vi.fn();

vi.mock("@/evals/run", () => ({
  runAllEvals: (...args: unknown[]) => runAllEvals(...args),
}));

describe("runCanaryPassKTrials early abort", () => {
  beforeEach(() => {
    runAllEvals.mockReset();
  });

  it("skips remaining trials when primary hard gates already fail", async () => {
    const { runCanaryPassKTrials } = await import(
      "@/workers/shadow-runner.worker"
    );

    const failRow = {
      scores: {
        escalationStageScorer: { score: 0 },
        duplicateActionScorer: { score: 1 },
        trajectoryScorer: { score: 1 },
      },
    };
    const primary = {
      "CLT-001": failRow,
      "CLT-003": failRow,
      "CLT-005": failRow,
    };

    const summary = await runCanaryPassKTrials({
      k: 3,
      canaryClientIds: ["CLT-001", "CLT-003", "CLT-005"],
      primaryResults: primary,
    });

    expect(runAllEvals).not.toHaveBeenCalled();
    expect(summary.earlyAborted).toBe(true);
    expect(summary.trialsRun).toBe(1);
    expect(summary.canaryPassK).toBe(false);
  });

  it("runs extra trials in canary-ci mode and aborts after a later hard fail", async () => {
    const { runCanaryPassKTrials } = await import(
      "@/workers/shadow-runner.worker"
    );

    const passRow = {
      scores: {
        escalationStageScorer: { score: 1 },
        onboardingStageScorer: { score: 1 },
        duplicateActionScorer: { score: 1 },
        trajectoryScorer: { score: 1 },
      },
    };
    const failRow = {
      scores: {
        escalationStageScorer: { score: 1 },
        onboardingStageScorer: { score: 1 },
        duplicateActionScorer: { score: 1 },
        trajectoryScorer: { score: 0 },
      },
    };

    runAllEvals.mockResolvedValueOnce({
      overallScore: 1,
      scenarioResults: {
        "CLT-001": passRow,
        "CLT-003": failRow,
        "CLT-005": passRow,
      },
      scorerBreakdown: {},
      evalRunId: "dry-run",
      mode: "canary-ci",
    });

    const primary = {
      "CLT-001": passRow,
      "CLT-003": passRow,
      "CLT-005": passRow,
    };

    const summary = await runCanaryPassKTrials({
      k: 3,
      canaryClientIds: ["CLT-001", "CLT-003", "CLT-005"],
      primaryResults: primary,
    });

    expect(runAllEvals).toHaveBeenCalledTimes(1);
    expect(runAllEvals.mock.calls[0]?.[1]).toMatchObject({
      mode: "canary-ci",
      skipPersist: true,
      clientIds: ["CLT-001", "CLT-003", "CLT-005"],
    });
    expect(summary.earlyAborted).toBe(true);
    expect(summary.trialsRun).toBe(2);
    expect(summary.canaryPassK).toBe(false);
  });
});
