import { z } from "zod";

/**
 * Expected / forbidden tool path for a CLT scenario.
 * REGULATORY: lucky DB end-state with a forbidden tool must fail the trajectory gate.
 */
export const trajectoryGoldenSchema = z
  .object({
    /** Tools that must appear at least once (any order). */
    expectedTools: z.array(z.string().min(1)).optional(),
    /** Ordered subsequence that must appear in the tool-call list. */
    expectedToolSequence: z.array(z.string().min(1)).optional(),
    /** Tools that must never appear. */
    forbiddenTools: z.array(z.string().min(1)).optional(),
    /** Maximum number of tool calls (step budget). */
    maxSteps: z.number().int().positive().max(100).optional(),
  })
  .refine(
    (v) =>
      (v.expectedTools?.length ?? 0) > 0 ||
      (v.expectedToolSequence?.length ?? 0) > 0 ||
      (v.forbiddenTools?.length ?? 0) > 0 ||
      v.maxSteps !== undefined,
    { message: "trajectory golden must constrain at least one dimension" }
  );

export type TrajectoryGolden = z.infer<typeof trajectoryGoldenSchema>;

/** Shared observation tools — almost every run should start with vault awareness. */
export const OBSERVE_SHARED = ["getClientProfile", "getActionHistory"] as const;

/** Compliance observation tool. */
export const OBSERVE_COMPLIANCE = ["getDocumentComplianceStatus"] as const;

/** Onboarding observation tool. */
export const OBSERVE_ONBOARDING = ["getOnboardingStatus"] as const;

/** Side-effect tools that must not fire on a clean / non-escalation vault. */
export const FORBIDDEN_ESCALATION_TOOLS = [
  "escalateToManagement",
  "escalateToComplianceOfficer",
  "sendClientReminder",
  "sendAdvisorAlert",
] as const;

/** Onboarding-only side effects that compliance canaries must never call. */
export const FORBIDDEN_ONBOARDING_SIDE_EFFECTS = [
  "requestDocument",
  "completeOnboarding",
  "advanceOnboardingStage",
  "alertAdvisorStuck",
  "setDocumentStatus",
  "validateDocumentReceived",
  "sendStageProgressNotice",
  "sendOnboardingCompleteNotice",
] as const;

/** Compliance-only side effects that onboarding canaries must never call. */
export const FORBIDDEN_COMPLIANCE_SIDE_EFFECTS = [
  "escalateToManagement",
  "escalateToComplianceOfficer",
  "sendClientReminder",
  "updateDocumentStatus",
  "markResolved",
  "requestMissingDocument",
] as const;
