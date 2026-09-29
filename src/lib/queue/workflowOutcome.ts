export type WorkflowOutcome =
  | "COMPLETED" | "ADVANCED" | "WAITING_FOR_APPROVAL" | "WAITING_FOR_COOLDOWN"
  | "BLOCKED" | "ACTION_TAKEN" | "NO_ACTION";

export function deriveWorkflowOutcome(actions: Array<{
  actionType: string; outcome?: string | null; reasoning?: string;
}>): WorkflowOutcome {
  const committed = (action: { outcome?: string | null }) => !!action.outcome
    && action.outcome !== "POLICY_BLOCKED" && action.outcome !== "HITL_DENIED";
  const completed = actions.some((action) => committed(action)
    && (action.actionType === "COMPLETE_ONBOARDING" || action.actionType === "MARK_RESOLVED"));
  if (completed) return "COMPLETED";
  if (actions.some((action) => committed(action) && action.actionType === "ADVANCE_STAGE")) return "ADVANCED";
  if (actions.some((action) => action.outcome === "HITL_SUSPENDED"
    || action.outcome === "PENDING_APPROVAL")) return "WAITING_FOR_APPROVAL";
  if (actions.some((action) => action.actionType !== "SCAN_VAULT" && committed(action))) {
    return "ACTION_TAKEN";
  }
  if (actions.some((action) => action.actionType === "SCAN_VAULT"
    && /cooldown|threshold|waiting/i.test(`${action.outcome ?? ""} ${action.reasoning ?? ""}`))) {
    return "WAITING_FOR_COOLDOWN";
  }
  if (actions.some((action) => action.outcome === "POLICY_BLOCKED")) return "BLOCKED";
  return "NO_ACTION";
}
