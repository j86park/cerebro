import { z } from "zod";
import { HARD_GATE_SCORER_IDS } from "@/evals/hard-gates";
import {
  duplicateActionScorer,
  documentPriorityScorer,
  escalationStageScorer,
  onboardingStageScorer,
  reasoningQualityScorer,
  trajectoryScorer,
} from "@/evals/scorers";
import type { MastraScorer } from "@mastra/core/evals";

/**
 * Scorer attachment modes (cheap-eval PR1).
 * - `canary-ci`: hard scorers only — soft LLM judge off the ship / canary path
 * - `full`: hard + soft scorers (nightly / opt-in live); soft still cannot override hard fails
 *
 * Which scenarios run is controlled separately by `suite-modes.ts` (`canary`/`full`/`smoke`).
 */
export const evalRunModeSchema = z.enum(["canary-ci", "full"]);
export type EvalRunMode = z.infer<typeof evalRunModeSchema>;

/** Soft scorers are advisory until calibrated — never hard canary gates. */
export const SOFT_SCORER_IDS = ["reasoningQualityScorer"] as const;
export type SoftScorerId = (typeof SOFT_SCORER_IDS)[number];

const SOFT_SCORER_ID_SET: ReadonlySet<string> = new Set(SOFT_SCORER_IDS);

/**
 * Returns true when the scorer id is a soft (LLM-judge) scorer.
 */
export function isSoftScorerId(scorerId: string): scorerId is SoftScorerId {
  return SOFT_SCORER_ID_SET.has(scorerId);
}

/**
 * Deterministic hard scorers for COMPLIANCE scenarios (incl. trajectory).
 */
export function complianceHardScorers(): MastraScorer[] {
  return [
    escalationStageScorer,
    duplicateActionScorer,
    documentPriorityScorer,
    trajectoryScorer,
  ];
}

/**
 * Deterministic hard scorers for ONBOARDING scenarios (incl. trajectory).
 */
export function onboardingHardScorers(): MastraScorer[] {
  return [onboardingStageScorer, duplicateActionScorer, trajectoryScorer];
}

/**
 * Soft scorers for full / nightly runs. Empty under `canary-ci`.
 */
export function softScorersForMode(mode: EvalRunMode): MastraScorer[] {
  if (mode === "canary-ci") return [];
  return [reasoningQualityScorer];
}

/**
 * Full scorer list for an agent type under the given mode.
 */
export function scorersForAgentType(
  agentType: "COMPLIANCE" | "ONBOARDING",
  mode: EvalRunMode = "full"
): MastraScorer[] {
  const hard =
    agentType === "COMPLIANCE"
      ? complianceHardScorers()
      : onboardingHardScorers();
  return [...hard, ...softScorersForMode(mode)];
}

export type ScoreEntry = { score?: number; reason?: string };

/**
 * True when any attached hard-gate scorer scored below 1.0.
 * Soft scores are ignored.
 */
export function hasHardGateFailure(
  scores: Record<string, ScoreEntry>
): boolean {
  for (const scorerId of HARD_GATE_SCORER_IDS) {
    const entry = scores[scorerId];
    if (entry === undefined) continue;
    if ((entry.score ?? 0) < 1.0) return true;
  }
  return false;
}

/**
 * Soft LLM judges are skipped when:
 * - mode is `canary-ci` (hard-only ship path), or
 * - any hard-gate scorer already failed (short-circuit; do not pay evalJudge).
 */
export function shouldSkipSoftJudges(
  mode: EvalRunMode,
  scoresAfterHard: Record<string, ScoreEntry>
): boolean {
  if (mode === "canary-ci") return true;
  return hasHardGateFailure(scoresAfterHard);
}

/**
 * Partitions a scenario's scorer list into hard-first then soft (stable order).
 * Soft = LLM judges; everything else (hard gates + deterministic outcome scorers) runs first.
 */
export function partitionHardThenSoft(
  scorers: readonly MastraScorer[]
): { hard: MastraScorer[]; soft: MastraScorer[] } {
  const hard: MastraScorer[] = [];
  const soft: MastraScorer[] = [];
  for (const scorer of scorers) {
    if (isSoftScorerId(scorer.id)) {
      soft.push(scorer);
    } else {
      hard.push(scorer);
    }
  }
  return { hard, soft };
}
