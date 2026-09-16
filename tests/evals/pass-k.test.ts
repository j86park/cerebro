import { describe, expect, it } from "vitest";
import {
  computePassK,
  scenarioTrialPassesHardGates,
  summarizeCanaryPassK,
} from "@/evals/pass-k";

describe("computePassK", () => {
  it("requires all k trials to pass (τ-bench pass^k)", () => {
    expect(computePassK([true, true, true], 3)).toBe(true);
    expect(computePassK([true, true, false], 3)).toBe(false);
    expect(computePassK([true, true], 3)).toBe(false); // insufficient trials
    expect(computePassK([true, true, true, false], 3)).toBe(true); // only first k
  });
});

describe("scenarioTrialPassesHardGates", () => {
  it("passes only when every attached hard scorer is 1.0", () => {
    expect(
      scenarioTrialPassesHardGates({
        scores: {
          escalationStageScorer: { score: 1 },
          duplicateActionScorer: { score: 1 },
          trajectoryScorer: { score: 1 },
          reasoningQualityScorer: { score: 0.5 },
        },
      })
    ).toBe(true);

    expect(
      scenarioTrialPassesHardGates({
        scores: {
          escalationStageScorer: { score: 1 },
          duplicateActionScorer: { score: 1 },
          trajectoryScorer: { score: 0 },
        },
      })
    ).toBe(false);
  });
});

describe("summarizeCanaryPassK", () => {
  const canaries = ["CLT-001", "CLT-003", "CLT-005"] as const;

  const passRow = {
    scores: {
      onboardingStageScorer: { score: 1 },
      duplicateActionScorer: { score: 1 },
      trajectoryScorer: { score: 1 },
      escalationStageScorer: { score: 1 },
    },
  };

  const failTrajectory = {
    scores: {
      onboardingStageScorer: { score: 1 },
      duplicateActionScorer: { score: 1 },
      trajectoryScorer: { score: 0, reason: "Forbidden tool" },
      escalationStageScorer: { score: 1 },
    },
  };

  it("sets canaryPassK true only when every canary passes all k trials", () => {
    const trials = [
      { "CLT-001": passRow, "CLT-003": passRow, "CLT-005": passRow },
      { "CLT-001": passRow, "CLT-003": passRow, "CLT-005": passRow },
      { "CLT-001": passRow, "CLT-003": passRow, "CLT-005": passRow },
    ];
    const summary = summarizeCanaryPassK(trials, canaries, 3);
    expect(summary.canaryPassK).toBe(true);
    expect(summary.perCanary["CLT-003"]).toBe(true);
  });

  it("blocks canaryPassK when one trial uses a forbidden tool on one canary", () => {
    const trials = [
      { "CLT-001": passRow, "CLT-003": passRow, "CLT-005": passRow },
      { "CLT-001": passRow, "CLT-003": failTrajectory, "CLT-005": passRow },
      { "CLT-001": passRow, "CLT-003": passRow, "CLT-005": passRow },
    ];
    const summary = summarizeCanaryPassK(trials, canaries, 3);
    expect(summary.canaryPassK).toBe(false);
    expect(summary.perCanary["CLT-003"]).toBe(false);
    expect(summary.perCanary["CLT-001"]).toBe(true);
  });
});
