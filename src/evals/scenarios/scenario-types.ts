import type { ExpectedOutcome } from "../ground-truth";
import type { MastraScorer } from "@mastra/core/evals";

export type AbstractScenario = {
  clientId: string;
  agentType: "COMPLIANCE" | "ONBOARDING";
  input: string;
  expected: ExpectedOutcome;
  scorers: MastraScorer<any, any, any, any>[];
};
