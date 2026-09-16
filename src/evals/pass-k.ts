import {
  canariesPassHardGates,
  type HardGateScenarioRow,
} from "@/evals/hard-gates";
import { env } from "@/lib/config";

/**
 * Default / configured `pass^k` trial count for canary mutation gates (τ-bench style).
 * All k independent trials must succeed for a canary to count as passing.
 */
export function getEvalPassK(): number {
  return env.EVAL_PASS_K;
}

/**
 * τ-bench `pass^k`: true only when every one of the k trials succeeded.
 */
export function computePassK(trialPasses: readonly boolean[], k: number): boolean {
  if (k < 1) {
    throw new Error(`computePassK: k must be >= 1, got ${k}`);
  }
  if (trialPasses.length < k) {
    return false;
  }
  for (let i = 0; i < k; i++) {
    if (trialPasses[i] !== true) return false;
  }
  return true;
}

/**
 * Whether a single scenario trial fully passes hard gates (incl. trajectory when attached).
 */
export function scenarioTrialPassesHardGates(row: HardGateScenarioRow | undefined): boolean {
  if (!row?.scores) return false;
  return canariesPassHardGates({ trial: row }, ["trial"]);
}

export type CanaryPassKSummary = {
  k: number;
  /** True only when every canary passed all k trials on hard gates. */
  canaryPassK: boolean;
  /** Per-canary: whether that canary's k trials all passed. */
  perCanary: Record<string, boolean>;
  /** Per-canary trial boolean vectors (length k). */
  trials: Record<string, boolean[]>;
};

/**
 * Aggregates k trial result maps into a canary `pass^k` summary.
 * Each entry in `trialResults` is one full eval map keyed by clientId.
 */
export function summarizeCanaryPassK(
  trialResults: readonly Record<string, HardGateScenarioRow>[],
  canaryClientIds: readonly string[],
  k: number = getEvalPassK()
): CanaryPassKSummary {
  const trials: Record<string, boolean[]> = {};
  for (const clientId of canaryClientIds) {
    trials[clientId] = [];
  }

  const limited = trialResults.slice(0, k);
  for (const resultMap of limited) {
    for (const clientId of canaryClientIds) {
      const row = resultMap[clientId];
      trials[clientId]!.push(scenarioTrialPassesHardGates(row));
    }
  }

  // Pad missing trials as failures (fail closed).
  for (const clientId of canaryClientIds) {
    while (trials[clientId]!.length < k) {
      trials[clientId]!.push(false);
    }
  }

  const perCanary: Record<string, boolean> = {};
  let allOk = canaryClientIds.length > 0;
  for (const clientId of canaryClientIds) {
    const ok = computePassK(trials[clientId]!, k);
    perCanary[clientId] = ok;
    if (!ok) allOk = false;
  }
  if (canaryClientIds.length === 0) {
    allOk = false;
  }

  return { k, canaryPassK: allOk, perCanary, trials };
}
