import { createScorer } from "@mastra/core/evals";
import type { ExpectedOutcome } from "../ground-truth";
import { extractActionFromOutput } from "./extract-action-output";

export const escalationStageScorer = createScorer({
  id: "escalationStageScorer",
  description: "Verifies the agent chose the correct escalation stage for compliance scenarios.",
})
.generateScore(async ({ run }) => {
  const expected = run.groundTruth as ExpectedOutcome;
  if (!expected || expected.escalationStage === undefined) {
    return 1.0;
  }

  const actionTaken = extractActionFromOutput(run.output);
  const correctStage = expected.escalationStage;

  const stageActionMap: Record<number, string> = {
    1: "NOTIFY_ADVISOR",
    2: "SEND_CLIENT_REMINDER",
    3: "SEND_CLIENT_REMINDER",
    4: "ESCALATE_COMPLIANCE",
    5: "ESCALATE_MANAGEMENT",
  };

  const expectedAction = stageActionMap[correctStage];
  
  if (!actionTaken) return 0.0;
  return actionTaken === expectedAction ? 1.0 : 0.0;
})
.generateReason(async ({ run, score }) => {
  const expected = run.groundTruth as ExpectedOutcome;
  if (!expected || expected.escalationStage === undefined) {
    return "N/A - Not an escalation scenario";
  }

  const actionTaken = extractActionFromOutput(run.output);
  const correctStage = expected.escalationStage;
  const stageActionMap: Record<number, string> = {
    1: "NOTIFY_ADVISOR",
    2: "SEND_CLIENT_REMINDER",
    3: "SEND_CLIENT_REMINDER",
    4: "ESCALATE_COMPLIANCE",
    5: "ESCALATE_MANAGEMENT",
  };
  const expectedAction = stageActionMap[correctStage];

  if (!actionTaken) {
    return `Failed to extract action from output. Expected ${expectedAction}.`;
  }

  return score === 1.0
    ? `Correctly chose ${actionTaken} for stage ${correctStage}`
    : `Expected ${expectedAction} for stage ${correctStage}, got ${actionTaken}`;
});
