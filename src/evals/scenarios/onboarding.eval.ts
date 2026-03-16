import { GROUND_TRUTH } from "../ground-truth";
import {
  onboardingStageScorer,
  duplicateActionScorer,
  reasoningQualityScorer,
} from "../scorers";
import type { AbstractScenario } from "./scenario-types";

export const onboardingScenarios: AbstractScenario[] = GROUND_TRUTH.filter(
  (g) => g.agentType === "ONBOARDING"
).map((g) => ({
  clientId: g.clientId,
  agentType: "ONBOARDING",
  input: `You are running for client ${g.clientId}.\nThis run was triggered by: ${g.trigger}.\nStart by calling your observation tools to understand the current state of this client's vault.`,
  expected: g.expected,
  scorers: [
    onboardingStageScorer,
    duplicateActionScorer,
    reasoningQualityScorer,
  ],
}));
