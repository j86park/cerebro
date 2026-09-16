import { CANARY_CLIENT_IDS } from "@/evals/ground-truth";
import { getApprovedCanaryClientIds } from "@/evals/golden/load-approved";

export type ScenarioScoresRow = Record<string, { score?: number; reason?: string }>;

/**
 * A scenario fully passes only when every scorer recorded a score of exactly 1.0.
 */
export function isFullyPassingScores(scores: ScenarioScoresRow): boolean {
  const values = Object.values(scores);
  if (values.length === 0) return false;
  return values.every((s) => (s?.score ?? 0) === 1.0);
}

/** @returns rate in [0,1], or 0 when the set is empty */
export function fullyPassingRate(
  clientIds: string[],
  scenarioResults: Record<string, { scores?: ScenarioScoresRow }>
): number {
  if (clientIds.length === 0) return 0;
  let pass = 0;
  for (const id of clientIds) {
    const row = scenarioResults[id];
    if (row?.scores && isFullyPassingScores(row.scores)) pass += 1;
  }
  return pass / clientIds.length;
}

/**
 * Seed canary ids from GROUND_TRUTH only (sync). Prefer `getCanaryClientIdsAsync`
 * when approved goldens may contribute canaries.
 */
export function getCanaryClientIds(): string[] {
  return [...CANARY_CLIENT_IDS];
}

/**
 * Canary ids = GROUND_TRUTH canaries ∪ approved golden canaries (ship gate only).
 */
export async function getCanaryClientIdsAsync(): Promise<string[]> {
  const approved = await getApprovedCanaryClientIds();
  return [...new Set([...CANARY_CLIENT_IDS, ...approved])];
}
