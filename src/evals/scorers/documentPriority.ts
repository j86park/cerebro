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

export const documentPriorityScorer = createScorer({
  id: "documentPriorityScorer",
  description: "Verifies the agent prioritized EXPIRED and MISSING documents before evaluating EXPIRING_SOON.",
})
.generateScore(async ({ run }) => {
  const expected = run.groundTruth as ExpectedOutcome;
  if (!expected || !expected.highestPriority) {
    return 1.0; // Auto-pass if no priority hierarchy needed
  }

  // Assuming agent tool output mentions the priority it targeted,
  // or its action targets a specific doc we know the priority of.
  // For simplicity, we check if the action it took matches what the highest priority item demanded.
  const actionTaken = extractActionFromOutput(run.output);
  if (!actionTaken) return 0.0;
  
  // Basic priority scoring against the master ExpectedOutcome
  // It's considered correct if the agent issued an action that is appropriate for the highest priority logic.
  // (We use ground-truth directly since we baked the priority outcome into the ExpectedOutcome "actionTaken" field)
  return actionTaken === expected.actionTaken ? 1.0 : 0.0;
})
.generateReason(async ({ run, score }) => {
  const expected = run.groundTruth as ExpectedOutcome;
  if (!expected || !expected.highestPriority) {
    return "N/A - No priority constraint in scenario";
  }
  const actionTaken = extractActionFromOutput(run.output);
  return score === 1.0 
    ? `Correct priority handled. (Action matched expected ${expected.actionTaken} for ${expected.highestPriority} issue)` 
    : `Failed priority check. Hit action ${actionTaken} instead of expected ${expected.actionTaken}.`;
});
