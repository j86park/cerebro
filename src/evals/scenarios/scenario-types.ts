import type { CanaryStratum } from "../canary-strata";
import type { ExpectedOutcome } from "../ground-truth";
import type { MastraScorer } from "@mastra/core/evals";

export type AbstractScenario = {
  clientId: string;
  agentType: "COMPLIANCE" | "ONBOARDING";
  input: string;
  expected: ExpectedOutcome;
  /** Copied from `GROUND_TRUTH` when present — used by mutation shadow gate only. */
  canary?: boolean;
  /** Stratified canary failure mode — copied from `GROUND_TRUTH` when present. */
  stratum?: CanaryStratum;
  /** Optional incident / failure id that seeded this canary. */
  sourceIncidentId?: string;
  scorers: MastraScorer[];
};
