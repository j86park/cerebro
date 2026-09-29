import { z } from "zod";

const actionHistoryItemSchema = z.object({
  actionType: z.string().min(1),
  outcome: z.string().nullable().optional(),
});

/**
 * Derives the next compliance escalation ladder stage (1–5) from ActionLedger history.
 * REGULATORY: stage progression is deterministic from prior actions, not model judgment.
 */
export function resolveComplianceLadderStage(
  history: Array<{ actionType: string; outcome?: string | null }>,
): number {
  // A denied attempt is evidence of a policy check, not a completed ladder step.
  const uncommittedOutcomes = new Set([
    "POLICY_BLOCKED", "PENDING_APPROVAL", "HITL_SUSPENDED",
    "HITL_DENIED", "HITL_TIMEOUT_SAFE_HOLD",
  ]);
  const parsed = z.array(actionHistoryItemSchema).parse(history).filter(
    (action) => !uncommittedOutcomes.has(action.outcome ?? ""),
  );

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
