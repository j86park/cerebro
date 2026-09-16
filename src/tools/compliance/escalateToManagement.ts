import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";
import {
  enforceToolPolicy,
  PolicyApprovalRequiredError,
  resolveComplianceLadderStage,
} from "@/lib/policy";
import { beginHitlSuspend } from "@/lib/hitl/suspend";

const inputSchema = z.object({
  reasoning: z
    .string()
    .min(20)
    .describe(
      "Detailed reasoning for escalating to management, including what stages have been completed",
    ),
});

const outputSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean(),
  policyVersion: z.string(),
  pendingApproval: z.boolean().optional(),
  workflowRunId: z.string().optional(),
  openKey: z.string().optional(),
});

/**
 * Builds escalateToManagement (policy: approve at stage 5 — durable HITL suspend).
 */
export function buildEscalateToManagement(vault: VaultService) {
  return createTool({
    id: "escalateToManagement",
    description:
      "Escalates an unresolved compliance issue to firm management. This is Stage 5 (final) of the escalation ladder. PREREQUISITE: Compliance officer escalation (Stage 4) must have been completed first. Requires advisor approval (HITL).",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { reasoning } = inputData;
      const { DRY_RUN } = env;

      const history = (await vault.getActionHistory()) as Array<{
        actionType: string;
      }>;
      const stage = resolveComplianceLadderStage(history);

      try {
        const policy = await enforceToolPolicy({
          vault,
          domain: "compliance",
          stage,
          toolName: "escalateToManagement",
          agentType: "COMPLIANCE",
          actionType: "ESCALATE_MANAGEMENT",
          reasoning,
        });

        await vault.checkActionCooldown("ESCALATE_MANAGEMENT", 5);

        const complianceEscalationDone = history.some(
          (a) => a.actionType === "ESCALATE_COMPLIANCE",
        );

        if (!complianceEscalationDone) {
          throw new Error(
            "Cannot escalate to management: compliance officer escalation has not occurred. " +
              "Complete Stage 4 (ESCALATE_COMPLIANCE) first.",
          );
        }

        if (!DRY_RUN) {
          // TODO: Send formal escalation notification via Resend to management
        }

        await vault.logAction({
          agentType: "COMPLIANCE",
          actionType: "ESCALATE_MANAGEMENT",
          trigger: "SCHEDULED",
          reasoning,
          outcome: DRY_RUN ? "DRY_RUN" : "ESCALATED",
          nextScheduledAt: new Date(
            new Date(env.DEMO_DATE).getTime() + 10 * 24 * 60 * 60 * 1000,
          ),
          stage: policy.stage,
          policyVersion: policy.policyVersion,
          reasonCodes: ["POLICY_ALLOW_AUTO"],
        });

        return {
          success: true,
          dryRun: DRY_RUN,
          policyVersion: policy.policyVersion,
        };
      } catch (error) {
        if (!(error instanceof PolicyApprovalRequiredError)) {
          throw error;
        }

        // REGULATORY: stage-5 escalation requires durable advisor HITL — suspend, do not auto-send.
        const suspended = await beginHitlSuspend({
          vault,
          clientId: vault.getClientId(),
          toolName: "escalateToManagement",
          actionType: "ESCALATE_MANAGEMENT",
          stage: error.stage,
          reasoning,
          policyVersion: error.policyVersion,
        });

        return {
          success: false,
          dryRun: DRY_RUN,
          policyVersion: error.policyVersion,
          pendingApproval: true,
          workflowRunId: suspended.workflowRunId,
          openKey: suspended.openKey,
        };
      }
    },
  });
}
