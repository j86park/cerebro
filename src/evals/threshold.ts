import {
  assertCanaryHardGates,
  type HardGateScenarioRow,
} from "@/evals/hard-gates";

/** Milestone 6 — overall eval gate (soft average; hard gates are separate). */
export const EVAL_OVERALL_THRESHOLD = 0.8 as const;

export class EvalThresholdError extends Error {
  readonly overallScore: number;

  constructor(overallScore: number) {
    super(
      `Eval overall score ${overallScore.toFixed(3)} is below required threshold ${EVAL_OVERALL_THRESHOLD}`
    );
    this.name = "EvalThresholdError";
    this.overallScore = overallScore;
  }
}

/**
 * Throws when the aggregated score does not meet the release gate.
 */
export function assertEvalOverallScore(overallScore: number): void {
  if (overallScore < EVAL_OVERALL_THRESHOLD) {
    throw new EvalThresholdError(overallScore);
  }
}

/**
 * Enforces canary hard gates first, then the overall average threshold.
 * Soft scorers (reasoningQuality) cannot override a hard-gate failure.
 */
export function assertEvalReleaseGates(
  overallScore: number,
  scenarioResults: Record<string, HardGateScenarioRow>
): void {
  assertCanaryHardGates(scenarioResults);
  assertEvalOverallScore(overallScore);
}
