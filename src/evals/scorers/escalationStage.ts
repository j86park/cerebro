import { createScorer } from "@mastra/core/evals";
import type { ExpectedOutcome } from "../ground-truth";

function extractActionFromOutput(output: any): string | null {
  if (typeof output === "string") {
    const match = output.match(/(SCAN_VAULT|NOTIFY_ADVISOR|SEND_CLIENT_REMINDER|ESCALATE_COMPLIANCE|ESCALATE_MANAGEMENT|MARK_RESOLVED|REQUEST_DOCUMENT|VALIDATE_DOCUMENT|ADVANCE_STAGE|COMPLETE_ONBOARDING|ALERT_ADVISOR_STUCK)/);
    return match ? match[1] : null;
  }
  if (output?.toolCalls && Array.isArray(output.toolCalls)) {
    for (const call of output.toolCalls) {
      if (call.name === "logAction" && call.args?.actionType) {
        return call.args.actionType;
      }
      const nameMap: Record<string, string> = {
        scanVault: "SCAN_VAULT",
        sendAdvisorAlert: "NOTIFY_ADVISOR",
        sendClientReminder: "SEND_CLIENT_REMINDER",
        escalateToComplianceOfficer: "ESCALATE_COMPLIANCE",
        escalateToManagement: "ESCALATE_MANAGEMENT",
        updateDocumentStatus: "MARK_RESOLVED",
        requestDocument: "REQUEST_DOCUMENT",
        validateDocumentReceived: "VALIDATE_DOCUMENT",
        advanceOnboardingStage: "ADVANCE_STAGE",
        completeOnboarding: "COMPLETE_ONBOARDING",
        alertAdvisorStuck: "ALERT_ADVISOR_STUCK"
      };
      if (nameMap[call.name]) {
        return nameMap[call.name];
      }
    }
  }
  return null;
}

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
