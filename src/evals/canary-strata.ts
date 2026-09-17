import { z } from "zod";
import { GROUND_TRUTH, type EvalScenario } from "@/evals/ground-truth";

/**
 * Stratified canary failure modes for mutation / CI partition (cheap-eval PR1).
 * Prefer distinct strata over uniform “first N” when expanding the canary set.
 */
export const canaryStratumSchema = z.enum([
  "onboarding_day1",
  "escalation_ladder",
  "compliant_forbidden_tools",
  "stuck_onboarding",
  "duplicate_action",
  "document_priority",
  "other",
]);

export type CanaryStratum = z.infer<typeof canaryStratumSchema>;

export type CanaryScenarioMeta = {
  clientId: string;
  agentType: EvalScenario["agentType"];
  stratum: CanaryStratum;
  /** Optional incident / failure id that seeded this canary. */
  sourceIncidentId?: string;
};

/**
 * Returns GROUND_TRUTH scenarios marked `canary: true` with required stratum metadata.
 * REGULATORY: canaries without a stratum are a configuration error (fail closed).
 */
export function listCanaryScenarioMeta(): CanaryScenarioMeta[] {
  const canaries = GROUND_TRUTH.filter((g) => g.canary === true);
  return canaries.map((g) => {
    if (!g.stratum) {
      throw new Error(
        `Canary scenario ${g.clientId} is missing required stratum metadata`
      );
    }
    const parsed = canaryStratumSchema.safeParse(g.stratum);
    if (!parsed.success) {
      throw new Error(
        `Canary scenario ${g.clientId} has invalid stratum: ${String(g.stratum)}`
      );
    }
    return {
      clientId: g.clientId,
      agentType: g.agentType,
      stratum: parsed.data,
      sourceIncidentId: g.sourceIncidentId,
    };
  });
}

/**
 * True when the canary set covers at least one onboarding and one compliance stratum.
 */
export function canaryPartitionIsStratified(
  meta: readonly CanaryScenarioMeta[] = listCanaryScenarioMeta()
): boolean {
  const strata = new Set(meta.map((m) => m.stratum));
  const agents = new Set(meta.map((m) => m.agentType));
  return (
    meta.length >= 2 &&
    agents.has("ONBOARDING") &&
    agents.has("COMPLIANCE") &&
    strata.size >= 2
  );
}
