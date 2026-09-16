import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { PolicyApprovalRequiredError, PolicyBlockedError } from "./errors";
import { evaluateToolPolicy, getToolPolicyMatrix } from "./matrix";
import { policyDomainSchema } from "./schemas";

const enforceToolPolicyInputSchema = z.object({
  vault: z.custom<VaultService>((v) => v != null && typeof v === "object"),
  domain: policyDomainSchema,
  stage: z.number().int().min(0),
  toolName: z.string().min(1),
  agentType: z.enum(["COMPLIANCE", "ONBOARDING"]),
  actionType: z.string().min(1),
  reasoning: z.string().min(1),
  trigger: z
    .enum(["SCHEDULED", "EVENT_UPLOAD", "MANUAL", "SIMULATION"])
    .optional(),
  documentId: z.string().optional(),
  args: z.record(z.unknown()).optional(),
});

export type EnforceToolPolicyInput = z.infer<typeof enforceToolPolicyInputSchema>;

export type EnforceToolPolicyResult = {
  mode: "auto";
  policyVersion: string;
  stage: number;
};

/**
 * Enforces the stage × tool policy matrix before side effects.
 * Always writes ActionLedger intent for block / approve decisions (including under DRY_RUN).
 * Returns only when mode is `auto`.
 */
export async function enforceToolPolicy(
  input: EnforceToolPolicyInput,
): Promise<EnforceToolPolicyResult> {
  const parsed = enforceToolPolicyInputSchema.parse(input);
  const trigger = parsed.trigger ?? "SCHEDULED";
  const matrix = getToolPolicyMatrix();
  const decision = evaluateToolPolicy(
    {
      domain: parsed.domain,
      stage: parsed.stage,
      toolName: parsed.toolName,
      args: parsed.args,
    },
    matrix,
  );

  if (decision.mode === "block") {
    await parsed.vault.logAction({
      agentType: parsed.agentType,
      actionType: parsed.actionType,
      trigger,
      reasoning: parsed.reasoning,
      outcome: "POLICY_BLOCKED",
      documentId: parsed.documentId,
      stage: parsed.stage,
      policyVersion: decision.policyVersion,
      actor: "AGENT",
      reasonCodes: ["POLICY_DENY", decision.reasonCode],
      citedFields: {
        toolName: parsed.toolName,
        domain: parsed.domain,
        mode: "block",
      },
    });

    throw new PolicyBlockedError({
      toolName: parsed.toolName,
      stage: parsed.stage,
      policyVersion: decision.policyVersion,
      reasonCode: decision.reasonCode,
    });
  }

  if (decision.mode === "approve") {
    // REGULATORY: never auto-execute stage 4+ escalations; ledger intent only until HITL.
    await parsed.vault.logAction({
      agentType: parsed.agentType,
      actionType: parsed.actionType,
      trigger,
      reasoning: parsed.reasoning,
      outcome: "PENDING_APPROVAL",
      documentId: parsed.documentId,
      stage: parsed.stage,
      policyVersion: decision.policyVersion,
      actor: "AGENT",
      reasonCodes: ["POLICY_REQUIRES_APPROVAL", decision.reasonCode],
      citedFields: {
        toolName: parsed.toolName,
        domain: parsed.domain,
        mode: "approve",
      },
    });

    throw new PolicyApprovalRequiredError({
      toolName: parsed.toolName,
      stage: parsed.stage,
      policyVersion: decision.policyVersion,
      reasonCode: decision.reasonCode,
    });
  }

  return {
    mode: "auto",
    policyVersion: decision.policyVersion,
    stage: parsed.stage,
  };
}
