import { describe, expect, it } from "vitest";
import { deriveWorkflowOutcome } from "@/lib/queue/workflowOutcome";

describe("workflow outcome from persisted action deltas", () => {
  it("does not equate an empty job to workflow progress", () => {
    expect(deriveWorkflowOutcome([])).toBe("NO_ACTION");
    expect(deriveWorkflowOutcome([{ actionType: "SCAN_VAULT", outcome: "NO_ACTION" }])).toBe("NO_ACTION");
  });
  it("distinguishes advancement, completion, approval wait, cooldown, and blocks", () => {
    expect(deriveWorkflowOutcome([{ actionType: "ADVANCE_STAGE", outcome: "ADVANCED" }])).toBe("ADVANCED");
    expect(deriveWorkflowOutcome([{ actionType: "COMPLETE_ONBOARDING", outcome: "ONBOARDING_COMPLETED" }])).toBe("COMPLETED");
    expect(deriveWorkflowOutcome([{ actionType: "ESCALATE_COMPLIANCE", outcome: "HITL_SUSPENDED" }])).toBe("WAITING_FOR_APPROVAL");
    expect(deriveWorkflowOutcome([{ actionType: "SCAN_VAULT", outcome: "NO_ACTION", reasoning: "waiting for cooldown" }])).toBe("WAITING_FOR_COOLDOWN");
    expect(deriveWorkflowOutcome([{ actionType: "NOTIFY_ADVISOR", outcome: "POLICY_BLOCKED" }])).toBe("BLOCKED");
  });
  it("reports actual actions even when the model later logs a cooldown note", () => {
    expect(deriveWorkflowOutcome([
      { actionType: "SEND_CLIENT_REMINDER", outcome: "DRY_RUN" },
      { actionType: "NOTIFY_ADVISOR", outcome: "DRY_RUN" },
      { actionType: "REQUEST_DOCUMENT", outcome: "POLICY_BLOCKED" },
      { actionType: "SCAN_VAULT", reasoning: "Waiting for cooldown", outcome: null },
    ])).toBe("ACTION_TAKEN");
    expect(deriveWorkflowOutcome([{ actionType: "MARK_RESOLVED", outcome: "POLICY_BLOCKED" }])).toBe("BLOCKED");
  });
});
