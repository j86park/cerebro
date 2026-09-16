import { z } from "zod";

/** Mastra workflow id registered on the shared Cerebro instance. */
export const COMPLIANCE_HITL_WORKFLOW_ID = "complianceHitlApproval" as const;

/** Suspend step id inside the compliance HITL workflow. */
export const COMPLIANCE_HITL_SUSPEND_STEP_ID = "awaitAdvisorDecision" as const;

export const hitlDecisionSchema = z.enum(["approve", "deny", "edit", "timeout"]);
export type HitlDecision = z.infer<typeof hitlDecisionSchema>;

export const hitlContextSchema = z.object({
  workflowId: z.literal(COMPLIANCE_HITL_WORKFLOW_ID),
  workflowRunId: z.string().min(1),
  suspendStepId: z.literal(COMPLIANCE_HITL_SUSPEND_STEP_ID),
  toolName: z.string().min(1),
  actionType: z.string().min(1),
  agentType: z.literal("COMPLIANCE"),
  stage: z.number().int().min(0),
  reasoning: z.string().min(1),
  policyVersion: z.string().min(1),
  documentId: z.string().optional(),
  openKey: z.string().min(1),
});

export type HitlContext = z.infer<typeof hitlContextSchema>;

export const hitlResumeJobSchema = z.object({
  kind: z.literal("hitl_resume"),
  clientId: z.string().min(1),
  workflowRunId: z.string().min(1),
  workflowId: z.literal(COMPLIANCE_HITL_WORKFLOW_ID),
  openKey: z.string().min(1),
  decision: hitlDecisionSchema,
  editedReasoning: z.string().min(1).optional(),
  advisorId: z.string().min(1).optional(),
});

export type HitlResumeJobPayload = z.infer<typeof hitlResumeJobSchema>;

export const hitlTimeoutJobSchema = z.object({
  kind: z.literal("hitl_timeout"),
  clientId: z.string().min(1),
  workflowRunId: z.string().min(1),
  workflowId: z.literal(COMPLIANCE_HITL_WORKFLOW_ID),
  openKey: z.string().min(1),
});

export type HitlTimeoutJobPayload = z.infer<typeof hitlTimeoutJobSchema>;

export const advisorDecisionRequestSchema = z.object({
  clientId: z.string().min(1),
  openKey: z.string().min(1),
  decision: z.enum(["approve", "deny", "edit"]),
  editedReasoning: z.string().min(1).optional(),
  advisorId: z.string().min(1).optional(),
});

export type AdvisorDecisionRequest = z.infer<typeof advisorDecisionRequestSchema>;

/**
 * Builds the durable openKey for an approve-class escalation pending HITL.
 */
export function buildHitlOpenKey(toolName: string, stage: number): string {
  return `hitl:${toolName}:stage-${stage}`;
}

/**
 * Joins kind/scope/detail into a BullMQ-legal 3-segment jobId.
 * BullMQ 5.71 rejects custom ids that contain `:` unless `split(':').length === 3`.
 */
function buildThreeSegmentHitlJobId(
  kind: string,
  scope: string,
  detail: string,
): string {
  for (const [label, value] of [
    ["kind", kind],
    ["scope", scope],
    ["detail", detail],
  ] as const) {
    if (!value || value.includes(":")) {
      throw new Error(
        `HITL jobId ${label} must be non-empty and must not contain ':': ${value}`,
      );
    }
  }
  const jobId = `${kind}:${scope}:${detail}`;
  if (jobId.split(":").length !== 3) {
    throw new Error(
      `HITL jobId must have exactly 3 ':' segments for BullMQ: ${jobId}`,
    );
  }
  return jobId;
}

/**
 * Deterministic BullMQ jobId for HITL resume (survives worker restart / double-submit).
 * Format: `hitl-resume:{workflowRunId}:{decision}` (exactly 3 segments).
 */
export function buildHitlResumeJobId(payload: {
  workflowRunId: string;
  decision: HitlDecision;
}): string {
  return buildThreeSegmentHitlJobId(
    "hitl-resume",
    payload.workflowRunId,
    payload.decision,
  );
}

/**
 * Deterministic BullMQ jobId for HITL timeout fallback.
 * Format: `hitl-timeout:{workflowRunId}:timeout` (exactly 3 segments — BullMQ 5.71).
 */
export function buildHitlTimeoutJobId(workflowRunId: string): string {
  return buildThreeSegmentHitlJobId("hitl-timeout", workflowRunId, "timeout");
}
