import { describe, expect, it } from "vitest";
import {
  hasHardGateFailure,
  isSoftScorerId,
  partitionHardThenSoft,
  scorersForAgentType,
  shouldSkipSoftJudges,
  softScorersForMode,
} from "@/evals/scorer-selection";
import { reasoningQualityScorer, trajectoryScorer } from "@/evals/scorers";

describe("scorer selection (canary-ci vs full)", () => {
  it("marks reasoningQuality as soft and trajectory as not soft", () => {
    expect(isSoftScorerId("reasoningQualityScorer")).toBe(true);
    expect(isSoftScorerId("trajectoryScorer")).toBe(false);
  });

  it("omits soft scorers in canary-ci mode", () => {
    expect(softScorersForMode("canary-ci")).toEqual([]);
    expect(softScorersForMode("full").map((s) => s.id)).toEqual([
      "reasoningQualityScorer",
    ]);

    const canaryCompliance = scorersForAgentType("COMPLIANCE", "canary-ci");
    expect(canaryCompliance.some((s) => s.id === "reasoningQualityScorer")).toBe(
      false
    );
    expect(canaryCompliance.some((s) => s.id === "trajectoryScorer")).toBe(true);

    const fullOnboarding = scorersForAgentType("ONBOARDING", "full");
    expect(fullOnboarding.some((s) => s.id === "reasoningQualityScorer")).toBe(
      true
    );
  });

  it("short-circuits soft judges on hard fail or canary-ci", () => {
    expect(shouldSkipSoftJudges("canary-ci", {})).toBe(true);
    expect(
      shouldSkipSoftJudges("full", {
        trajectoryScorer: { score: 0 },
        escalationStageScorer: { score: 1 },
      })
    ).toBe(true);
    expect(
      shouldSkipSoftJudges("full", {
        trajectoryScorer: { score: 1 },
        escalationStageScorer: { score: 1 },
        duplicateActionScorer: { score: 1 },
      })
    ).toBe(false);
  });

  it("detects hard-gate failures without looking at soft scores", () => {
    expect(
      hasHardGateFailure({
        trajectoryScorer: { score: 0 },
        reasoningQualityScorer: { score: 1 },
      })
    ).toBe(true);
    expect(
      hasHardGateFailure({
        trajectoryScorer: { score: 1 },
        reasoningQualityScorer: { score: 0 },
      })
    ).toBe(false);
  });

  it("partitions hard scorers before soft", () => {
    const { hard, soft } = partitionHardThenSoft([
      reasoningQualityScorer,
      trajectoryScorer,
    ]);
    expect(hard.map((s) => s.id)).toEqual(["trajectoryScorer"]);
    expect(soft.map((s) => s.id)).toEqual(["reasoningQualityScorer"]);
  });
});
