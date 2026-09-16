import { describe, expect, it } from "vitest";
import {
  assertCanaryHardGates,
  canariesPassHardGates,
  collectCanaryHardGateFailures,
  EvalHardGateError,
  HARD_GATE_SCORER_IDS,
  isHardGateScorerId,
} from "@/evals/hard-gates";
import {
  assertEvalOverallScore,
  assertEvalReleaseGates,
  EvalThresholdError,
  EVAL_OVERALL_THRESHOLD,
} from "@/evals/threshold";

describe("canary hard gates", () => {
  it("lists escalation, onboarding, duplicate, and trajectory as hard-gate scorers", () => {
    expect([...HARD_GATE_SCORER_IDS].sort()).toEqual(
      [
        "duplicateActionScorer",
        "escalationStageScorer",
        "onboardingStageScorer",
        "trajectoryScorer",
      ].sort()
    );
    expect(isHardGateScorerId("reasoningQualityScorer")).toBe(false);
    expect(isHardGateScorerId("trajectoryScorer")).toBe(true);
  });

  it("fails when a canary has wrong escalation stage even if reasoningQuality is perfect", () => {
    const scenarioResults = {
      "CLT-003": {
        scores: {
          escalationStageScorer: {
            score: 0,
            reason: "Expected ESCALATE_MANAGEMENT, got NOTIFY_ADVISOR",
          },
          duplicateActionScorer: { score: 1 },
          trajectoryScorer: { score: 1 },
          documentPriorityScorer: { score: 1 },
          // Soft judge cannot paper over the hard fail
          reasoningQualityScorer: { score: 1, reason: "Excellent prose" },
        },
      },
      "CLT-001": {
        scores: {
          onboardingStageScorer: { score: 1 },
          duplicateActionScorer: { score: 1 },
          trajectoryScorer: { score: 1 },
          reasoningQualityScorer: { score: 1 },
        },
      },
      "CLT-005": {
        scores: {
          escalationStageScorer: { score: 1 },
          duplicateActionScorer: { score: 1 },
          trajectoryScorer: { score: 1 },
          documentPriorityScorer: { score: 1 },
          reasoningQualityScorer: { score: 1 },
        },
      },
    };

    const failures = collectCanaryHardGateFailures(scenarioResults, [
      "CLT-001",
      "CLT-003",
      "CLT-005",
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      clientId: "CLT-003",
      scorerId: "escalationStageScorer",
      score: 0,
    });
    expect(canariesPassHardGates(scenarioResults, ["CLT-001", "CLT-003", "CLT-005"])).toBe(
      false
    );
    expect(() =>
      assertCanaryHardGates(scenarioResults, ["CLT-001", "CLT-003", "CLT-005"])
    ).toThrow(EvalHardGateError);
  });

  it("fails when canary trajectory is wrong even if stage/action scorers pass", () => {
    const scenarioResults = {
      "CLT-003": {
        scores: {
          escalationStageScorer: { score: 1 },
          duplicateActionScorer: { score: 1 },
          trajectoryScorer: {
            score: 0,
            reason: "Forbidden tool(s) used: completeOnboarding",
          },
          reasoningQualityScorer: { score: 1 },
        },
      },
    };

    const failures = collectCanaryHardGateFailures(scenarioResults, ["CLT-003"]);
    expect(failures).toEqual([
      expect.objectContaining({
        clientId: "CLT-003",
        scorerId: "trajectoryScorer",
        score: 0,
      }),
    ]);
    expect(() => assertCanaryHardGates(scenarioResults, ["CLT-003"])).toThrow(
      EvalHardGateError
    );
  });

  it("fails when a canary onboarding stage is wrong", () => {
    const scenarioResults = {
      "CLT-001": {
        scores: {
          onboardingStageScorer: { score: 0, reason: "Wrong stage action" },
          duplicateActionScorer: { score: 1 },
          reasoningQualityScorer: { score: 0.95 },
        },
      },
    };

    expect(() => assertCanaryHardGates(scenarioResults, ["CLT-001"])).toThrow(
      /CLT-001\/onboardingStageScorer/
    );
  });

  it("fails when a canary duplicate-action scorer is wrong", () => {
    const scenarioResults = {
      "CLT-005": {
        scores: {
          escalationStageScorer: { score: 1 },
          duplicateActionScorer: { score: 0, reason: "Missed cooldown" },
          reasoningQualityScorer: { score: 1 },
        },
      },
    };

    expect(() => assertCanaryHardGates(scenarioResults, ["CLT-005"])).toThrow(
      EvalHardGateError
    );
  });

  it("passes when all canary hard scorers are 1.0 even if soft judge is fractional", () => {
    const scenarioResults = {
      "CLT-003": {
        scores: {
          escalationStageScorer: { score: 1 },
          duplicateActionScorer: { score: 1 },
          reasoningQualityScorer: { score: 0.7 },
        },
      },
    };

    expect(canariesPassHardGates(scenarioResults, ["CLT-003"])).toBe(true);
    expect(() => assertCanaryHardGates(scenarioResults, ["CLT-003"])).not.toThrow();
  });

  it("ignores hard-gate scorer ids not present on a scenario", () => {
    const scenarioResults = {
      "CLT-001": {
        scores: {
          onboardingStageScorer: { score: 1 },
          duplicateActionScorer: { score: 1 },
          // no escalationStageScorer — onboarding canary
        },
      },
    };

    expect(() => assertCanaryHardGates(scenarioResults, ["CLT-001"])).not.toThrow();
  });
});

describe("eval release gates", () => {
  it("throws EvalHardGateError before overall threshold when canary stage is wrong", () => {
    // Overall average would be high enough to pass soft threshold alone:
    // 0.75 of scores are 1.0 → but we construct overallScore artificially above threshold.
    const scenarioResults = {
      "CLT-003": {
        scores: {
          escalationStageScorer: { score: 0 },
          duplicateActionScorer: { score: 1 },
          reasoningQualityScorer: { score: 1 },
        },
      },
    };

    expect(() =>
      assertEvalReleaseGates(0.99, scenarioResults)
    ).toThrow(EvalHardGateError);

    // Soft overall check alone would have passed:
    expect(() => assertEvalOverallScore(0.99)).not.toThrow();
    expect(EVAL_OVERALL_THRESHOLD).toBe(0.8);
  });

  it("throws EvalThresholdError when hard gates pass but overall is below threshold", () => {
    const scenarioResults = {
      "CLT-003": {
        scores: {
          escalationStageScorer: { score: 1 },
          duplicateActionScorer: { score: 1 },
          reasoningQualityScorer: { score: 0.5 },
        },
      },
    };

    expect(() => assertEvalReleaseGates(0.5, scenarioResults)).toThrow(
      EvalThresholdError
    );
  });

  it("does not throw when hard gates and overall threshold both pass", () => {
    const scenarioResults = {
      "CLT-003": {
        scores: {
          escalationStageScorer: { score: 1 },
          duplicateActionScorer: { score: 1 },
          reasoningQualityScorer: { score: 0.9 },
        },
      },
    };

    expect(() => assertEvalReleaseGates(0.9, scenarioResults)).not.toThrow();
  });
});
