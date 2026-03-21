import { createScorer } from "@mastra/core/evals";
import type { ExpectedOutcome } from "../ground-truth";
import { extractActionFromOutput } from "./extract-action-output";

export const onboardingStageScorer = createScorer({
  id: "onboardingStageScorer",
  description: "Verifies the agent advanced or maintained the correct onboarding stage.",
})
.generateScore(async ({ run }) => {
  const expected = run.groundTruth as ExpectedOutcome;
  if (!expected || expected.onboardingStage === undefined) {
    return 1.0;
  }

  const actionTaken = extractActionFromOutput(run.output);
  if (!actionTaken) return 0.0;
  
  return actionTaken === expected.actionTaken ? 1.0 : 0.0;
})
.generateReason(async ({ run, score }) => {
  const expected = run.groundTruth as ExpectedOutcome;
  if (!expected || expected.onboardingStage === undefined) {
    return "N/A - Not an onboarding stage scenario";
  }
  const actionTaken = extractActionFromOutput(run.output);
  return score === 1.0 
    ? `Correct onboarding action taken for Stage ${expected.onboardingStage}`
    : `Incorrect onboarding action. Expected ${expected.actionTaken}, got ${actionTaken}.`;
});
