import { GROUND_TRUTH } from "../ground-truth";
import {
  escalationStageScorer,
  duplicateActionScorer,
  documentPriorityScorer,
  reasoningQualityScorer,
} from "../scorers";
import type { AbstractScenario } from "./scenario-types";

export const complianceScenarios: AbstractScenario[] = GROUND_TRUTH.filter(
  (g) => g.agentType === "COMPLIANCE"
).map((g) => ({
  clientId: g.clientId,
  agentType: "COMPLIANCE",
  canary: g.canary,
  input: `You are running for client ${g.clientId}.\nThis run was triggered by: ${g.trigger}.\nStart by calling your observation tools to understand the current state of this client's vault.`,
  expected: g.expected,
  scorers: [
    escalationStageScorer,
    duplicateActionScorer,
    documentPriorityScorer,
    reasoningQualityScorer,
  ],
}));
