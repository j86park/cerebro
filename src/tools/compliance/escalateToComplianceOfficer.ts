import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";
import { sendTransactionalEmail } from "@/lib/email/resend";
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
      "Detailed reasoning for escalating to the compliance officer, including what stages have been completed",
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
 * Builds escalateToComplianceOfficer (policy: approve at stage 4 — durable HITL suspend).
 */
export function buildEscalateToComplianceOfficer(vault: VaultService) {
  return createTool({
    id: "escalateToComplianceOfficer",
    description:
      "Escalates an unresolved compliance issue to the firm's compliance officer. This is Stage 4 of the escalation ladder. PREREQUISITE: At least 2 client reminders must have been sent before this can be called. Requires advisor approval (HITL).",
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
          toolName: "escalateToComplianceOfficer",
          agentType: "COMPLIANCE",
          actionType: "ESCALATE_COMPLIANCE",
          reasoning,
        });

        await vault.checkActionCooldown("ESCALATE_COMPLIANCE", 5);

        const reminderCount = history.filter(
          (a) => a.actionType === "SEND_CLIENT_REMINDER",
        ).length;

        if (reminderCount < 2) {
          throw new Error(
            `Cannot escalate to compliance officer: only ${reminderCount} client reminder(s) sent. ` +
              `At least 2 SEND_CLIENT_REMINDER actions must be completed before escalation (Stages 2 and 3).`,
          );
        }

        const profile = (await vault.getClientProfile()) as {
          name: string;
          advisor: { email: string };
        };
        await sendTransactionalEmail({
          to: profile.advisor.email,
          subject: `Compliance escalation: ${profile.name}`,
          text:
            `Formal Stage 4 escalation to the compliance officer for client ${profile.name}.\n\n` +
            `${reasoning}`,
        });

        await vault.logAction({
          agentType: "COMPLIANCE",
          actionType: "ESCALATE_COMPLIANCE",
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

        // REGULATORY: stage-4 escalation requires durable advisor HITL — suspend, do not auto-send.
        const suspended = await beginHitlSuspend({
          vault,
          clientId: vault.getClientId(),
          toolName: "escalateToComplianceOfficer",
          actionType: "ESCALATE_COMPLIANCE",
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
