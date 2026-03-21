import type { ExpectedOutcome } from "../ground-truth";
import type { MastraScorer } from "@mastra/core/evals";

export type AbstractScenario = {
  clientId: string;
  agentType: "COMPLIANCE" | "ONBOARDING";
  input: string;
  expected: ExpectedOutcome;
  /** Copied from `GROUND_TRUTH` when present — used by mutation shadow gate only. */
  canary?: boolean;
  scorers: MastraScorer<any, any, any, any>[];
};
