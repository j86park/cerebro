import { z } from "zod";

const actionHistoryItemSchema = z.object({
  actionType: z.string().min(1),
});

/**
 * Derives the next compliance escalation ladder stage (1–5) from ActionLedger history.
 * REGULATORY: stage progression is deterministic from prior actions, not model judgment.
 */
export function resolveComplianceLadderStage(
  history: Array<{ actionType: string }>,
): number {
  const parsed = z.array(actionHistoryItemSchema).parse(history);

  const hasManagement = parsed.some((a) => a.actionType === "ESCALATE_MANAGEMENT");
  if (hasManagement) {
    return 5;
  }

  const hasCompliance = parsed.some((a) => a.actionType === "ESCALATE_COMPLIANCE");
  if (hasCompliance) {
    return 5;
  }

  const reminderCount = parsed.filter(
    (a) => a.actionType === "SEND_CLIENT_REMINDER",
  ).length;
  if (reminderCount >= 2) {
    return 4;
  }
  if (reminderCount >= 1) {
    return 3;
  }

  const hasAdvisor = parsed.some((a) => a.actionType === "NOTIFY_ADVISOR");
  if (hasAdvisor) {
    return 2;
  }

  return 1;
}
