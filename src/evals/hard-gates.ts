import { getCanaryClientIds } from "@/lib/eval-scenario-utils";

/**
 * Deterministic scorers that must score exactly 1.0 on every canary scenario.
 * REGULATORY: wrong escalation/onboarding stage or duplicate action must never be
 * papered over by a soft LLM judge (reasoningQuality).
 */
export const HARD_GATE_SCORER_IDS = [
  "escalationStageScorer",
  "onboardingStageScorer",
  "duplicateActionScorer",
] as const;

export type HardGateScorerId = (typeof HARD_GATE_SCORER_IDS)[number];

const HARD_GATE_SCORER_ID_SET: ReadonlySet<string> = new Set(HARD_GATE_SCORER_IDS);

export type HardGateScoreEntry = { score?: number; reason?: string };

export type HardGateScenarioRow = {
  scores: Record<string, HardGateScoreEntry>;
};

export type HardGateFailure = {
  clientId: string;
  scorerId: HardGateScorerId;
  score: number;
  reason?: string;
};

/**
 * Returns true when the scorer id is a canary hard gate.
 */
export function isHardGateScorerId(scorerId: string): scorerId is HardGateScorerId {
  return HARD_GATE_SCORER_ID_SET.has(scorerId);
}

/**
 * Collects hard-gate failures for canary scenarios only.
 * Soft scorers (e.g. reasoningQuality) are ignored — they cannot rescue a hard fail.
 */
export function collectCanaryHardGateFailures(
  scenarioResults: Record<string, HardGateScenarioRow>,
  canaryClientIds: readonly string[] = getCanaryClientIds()
): HardGateFailure[] {
  const failures: HardGateFailure[] = [];

  for (const clientId of canaryClientIds) {
    const row = scenarioResults[clientId];
    if (!row?.scores) continue;

    for (const scorerId of HARD_GATE_SCORER_IDS) {
      const entry = row.scores[scorerId];
      // Scorer not attached to this scenario (e.g. onboardingStage on compliance) — skip.
      if (entry === undefined) continue;
      const score = entry.score ?? 0;
      if (score < 1.0) {
        failures.push({
          clientId,
          scorerId,
          score,
          reason: entry.reason,
        });
      }
    }
  }

  return failures;
}

/**
 * True when every canary that ran a hard-gate scorer scored 1.0 on all of them.
 */
export function canariesPassHardGates(
  scenarioResults: Record<string, HardGateScenarioRow>,
  canaryClientIds?: readonly string[]
): boolean {
  return collectCanaryHardGateFailures(scenarioResults, canaryClientIds).length === 0;
}

export class EvalHardGateError extends Error {
  readonly failures: HardGateFailure[];

  constructor(failures: HardGateFailure[]) {
    const summary = failures
      .map((f) => `${f.clientId}/${f.scorerId}=${f.score}`)
      .join("; ");
    super(
      `Eval canary hard-gate failure(s): ${summary}. Soft scorers (reasoningQuality) cannot override hard fails.`
    );
    this.name = "EvalHardGateError";
    this.failures = failures;
  }
}

/**
 * Throws when any canary hard-gate scorer scored below 1.0.
 */
export function assertCanaryHardGates(
  scenarioResults: Record<string, HardGateScenarioRow>,
  canaryClientIds?: readonly string[]
): void {
  const failures = collectCanaryHardGateFailures(scenarioResults, canaryClientIds);
  if (failures.length > 0) {
    throw new EvalHardGateError(failures);
  }
}
