import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { EscalationStatus } from "@/lib/db/enums";
import { env } from "@/lib/config";
import {
  hitlContextSchema,
  hitlDecisionSchema,
  type HitlContext,
  type HitlDecision,
} from "./schemas";

const applyHitlDecisionInputSchema = z.object({
  vault: z.custom<VaultService>((v) => v != null && typeof v === "object"),
  context: hitlContextSchema,
  decision: hitlDecisionSchema,
  editedReasoning: z.string().min(1).optional(),
  advisorId: z.string().min(1).optional(),
});

export type ApplyHitlDecisionInput = z.infer<typeof applyHitlDecisionInputSchema>;

export type ApplyHitlDecisionResult = {
  decision: HitlDecision;
  outcome: string;
  dryRun: boolean;
  emailSent: false;
  vaultMutated: boolean;
};

/**
 * Applies an advisor (or timeout) HITL decision to ledger + EscalationState.
 * REGULATORY: timeout and deny never send client/officer email or mutate documents.
 * Approve may log escalation outcome under DRY_RUN without external send.
 */
export async function applyHitlDecision(
  input: ApplyHitlDecisionInput,
): Promise<ApplyHitlDecisionResult> {
  const parsed = applyHitlDecisionInputSchema.parse(input);
  const { vault, context, decision, advisorId } = parsed;
  const reasoning =
    decision === "edit" && parsed.editedReasoning
      ? parsed.editedReasoning
      : context.reasoning;
  const dryRun = env.DRY_RUN;

  if (decision === "timeout") {
    // REGULATORY: never silent auto-approve regulated escalations on timeout.
    await vault.upsertEscalationState({
      openKey: context.openKey,
      ladderStage: context.stage,
      status: EscalationStatus.SAFE_HOLD,
      documentId: context.documentId,
      policyVersion: context.policyVersion,
      reasonCodes: ["HITL_TIMEOUT", "SAFE_HOLD", "NO_AUTO_APPROVE"],
      hitlContext: context,
    });

    await vault.logAction({
      agentType: context.agentType,
      actionType: context.actionType,
      trigger: "SCHEDULED",
      reasoning: `HITL timeout for ${context.toolName}; moved to SAFE_HOLD (no auto-approve).`,
      outcome: "HITL_TIMEOUT_SAFE_HOLD",
      documentId: context.documentId,
      stage: context.stage,
      policyVersion: context.policyVersion,
      actor: "SYSTEM",
      reasonCodes: ["HITL_TIMEOUT", "SAFE_HOLD", "NO_AUTO_APPROVE"],
      citedFields: {
        workflowRunId: context.workflowRunId,
        toolName: context.toolName,
        decision: "timeout",
      },
      idempotencyKey: `hitl-timeout:${context.workflowRunId}`,
    });

    return {
      decision,
      outcome: "HITL_TIMEOUT_SAFE_HOLD",
      dryRun,
      emailSent: false,
      vaultMutated: false,
    };
  }

  if (decision === "deny") {
    await vault.resolveEscalationState({
      openKey: context.openKey,
      status: EscalationStatus.RESOLVED,
      reasonCodes: ["HITL_DENIED", "ADVISOR_DENIED"],
    });

    await vault.logAction({
      agentType: context.agentType,
      actionType: context.actionType,
      trigger: "MANUAL",
      reasoning: `Advisor denied ${context.toolName}: ${reasoning}`,
      outcome: "HITL_DENIED",
      documentId: context.documentId,
      stage: context.stage,
      policyVersion: context.policyVersion,
      actor: "ADVISOR",
      reasonCodes: ["HITL_DENIED", "ADVISOR_DENIED"],
      citedFields: {
        workflowRunId: context.workflowRunId,
        toolName: context.toolName,
        decision: "deny",
        advisorId: advisorId ?? null,
      },
      idempotencyKey: `hitl-deny:${context.workflowRunId}`,
    });

    return {
      decision,
      outcome: "HITL_DENIED",
      dryRun,
      emailSent: false,
      vaultMutated: false,
    };
  }

  // approve | edit — execute escalation ledger side effect only after explicit advisor approval.
  // REGULATORY: side effects require HITL; never treat timeout as approval.
  await vault.resolveEscalationState({
    openKey: context.openKey,
    status: EscalationStatus.RESOLVED,
    reasonCodes: ["HITL_APPROVED", decision === "edit" ? "HITL_EDITED" : "HITL_APPROVED"],
  });

  const outcome = dryRun ? "DRY_RUN" : "ESCALATED";

  if (!dryRun) {
    // External officer/management notify stays gated; no silent send on resume.
    // Real Resend wiring remains out of scope for WP-P0.3; DRY_RUN tests assert no network.
  }

  await vault.logAction({
    agentType: context.agentType,
    actionType: context.actionType,
    trigger: "MANUAL",
    reasoning,
    outcome,
    documentId: context.documentId,
    stage: context.stage,
    policyVersion: context.policyVersion,
    actor: "ADVISOR",
    reasonCodes: [
      "HITL_APPROVED",
      decision === "edit" ? "HITL_EDITED" : "POLICY_ALLOW_AFTER_APPROVAL",
    ],
    citedFields: {
      workflowRunId: context.workflowRunId,
      toolName: context.toolName,
      decision,
      advisorId: advisorId ?? null,
      dryRun,
    },
    idempotencyKey: `hitl-approve:${context.workflowRunId}`,
  });

  return {
    decision,
    outcome,
    dryRun,
    emailSent: false,
    vaultMutated: false,
  };
}

/**
 * Parses EscalationState.hitlContext JSON into a validated HitlContext.
 */
export function parseHitlContext(raw: unknown): HitlContext {
  return hitlContextSchema.parse(raw);
}
