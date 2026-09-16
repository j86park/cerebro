import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";
import {
  enforceToolPolicy,
  resolveComplianceLadderStage,
} from "@/lib/policy";

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
});

/**
 * Builds escalateToManagement (policy: approve at stage 5 — HITL in WP-P0.3).
 */
export function buildEscalateToManagement(vault: VaultService) {
  return createTool({
    id: "escalateToManagement",
    description:
      "Escalates an unresolved compliance issue to firm management. This is Stage 5 (final) of the escalation ladder. PREREQUISITE: Compliance officer escalation (Stage 4) must have been completed first.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { reasoning } = inputData;
      const { DRY_RUN } = env;

      const history = (await vault.getActionHistory()) as Array<{
        actionType: string;
      }>;
      const stage = resolveComplianceLadderStage(history);

      // Policy gate before side effects (approve path ledger-only until HITL).
      const policy = await enforceToolPolicy({
        vault,
        domain: "compliance",
        stage,
        toolName: "escalateToManagement",
        agentType: "COMPLIANCE",
        actionType: "ESCALATE_MANAGEMENT",
        reasoning,
      });

      // Enforce 5-day duplicate action cooldown
      await vault.checkActionCooldown("ESCALATE_MANAGEMENT", 5);

      // Self-enforce prerequisite: Stage 4 (ESCALATE_COMPLIANCE) must be complete
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

      // Always log the action
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
    },
  });
}
