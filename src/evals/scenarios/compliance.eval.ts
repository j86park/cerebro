import { GROUND_TRUTH } from "../ground-truth";
import {
  escalationStageScorer,
  duplicateActionScorer,
  documentPriorityScorer,
  reasoningQualityScorer,
  trajectoryScorer,
} from "../scorers";
import type { AbstractScenario } from "./scenario-types";

export const complianceScenarios: AbstractScenario[] = GROUND_TRUTH.filter(
  (g) => g.agentType === "COMPLIANCE"
).map((g) => ({
  clientId: g.clientId,
  agentType: "COMPLIANCE",
  canary: g.canary,
  stratum: g.stratum,
  sourceIncidentId: g.sourceIncidentId,
  input: `You are running for client ${g.clientId}.\nThis run was triggered by: ${g.trigger}.\nStart by calling your observation tools to understand the current state of this client's vault.`,
  expected: g.expected,
  // Default scorer list includes soft judge; `runAllEvals({ mode: "canary-ci" })` strips soft.
  scorers: [
    escalationStageScorer,
    duplicateActionScorer,
    documentPriorityScorer,
    trajectoryScorer,
    reasoningQualityScorer,
  ],
}));
