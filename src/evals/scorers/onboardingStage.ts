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
