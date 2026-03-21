/**
 * Parses agent `generate` output (string or structured tool-call shape) for a logged action type.
 */
export function extractActionFromOutput(output: unknown): string | null {
  if (typeof output === "string") {
    const match = output.match(
      /(SCAN_VAULT|NOTIFY_ADVISOR|SEND_CLIENT_REMINDER|ESCALATE_COMPLIANCE|ESCALATE_MANAGEMENT|MARK_RESOLVED|REQUEST_DOCUMENT|VALIDATE_DOCUMENT|ADVANCE_STAGE|COMPLETE_ONBOARDING|ALERT_ADVISOR_STUCK)/
    );
    return match ? match[1]! : null;
  }
  if (typeof output !== "object" || output === null) return null;
  const rec = output as Record<string, unknown>;
  const toolCalls = rec.toolCalls;
  if (!Array.isArray(toolCalls)) return null;
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
    alertAdvisorStuck: "ALERT_ADVISOR_STUCK",
  };
  for (const call of toolCalls) {
    if (typeof call !== "object" || call === null) continue;
    const c = call as Record<string, unknown>;
    if (c.name === "logAction") {
      const args = c.args;
      if (typeof args === "object" && args !== null) {
        const a = args as Record<string, unknown>;
        if (typeof a.actionType === "string") return a.actionType;
      }
    }
    if (typeof c.name === "string" && nameMap[c.name]) {
      return nameMap[c.name];
    }
  }
  return null;
}
