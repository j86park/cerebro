import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";
import { addDemoDays } from "@/lib/dates/demo-date";
import { sendTransactionalEmail } from "@/lib/email/resend";
import {
  enforceToolPolicy,
  resolveComplianceLadderStage,
} from "@/lib/policy";

const agentTypeSchema = z.enum(["COMPLIANCE", "ONBOARDING"]);

const inputSchema = z.object({
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("Email body content"),
  reasoning: z
    .string()
    .min(20)
    .describe("Detailed reasoning for why the advisor is being alerted"),
});

const outputSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean(),
  policyVersion: z.string(),
  agentType: agentTypeSchema,
});

export type BuildSendAdvisorAlertOptions = {
  /** Ledger actor — must match the calling agent (shared tool honesty). */
  agentType?: z.infer<typeof agentTypeSchema>;
};

/**
 * Builds the sendAdvisorAlert tool (stage-gated via policy matrix).
 * REGULATORY: 5-day no-repeat cooldown on NOTIFY_ADVISOR.
 */
export function buildSendAdvisorAlert(
  vault: VaultService,
  options: BuildSendAdvisorAlertOptions = {},
) {
  const ledgerAgentType = agentTypeSchema.parse(
    options.agentType ?? "COMPLIANCE",
  );

  return createTool({
    id: "sendAdvisorAlert",
    description:
      "Sends an alert email to the client's advisor. Used in Stage 1 and Stage 3 of the escalation ladder. Always logs the action.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { subject, body, reasoning } = inputData;
      const { DRY_RUN } = env;

      const history = (await vault.getActionHistory()) as Array<{
        actionType: string;
      }>;
      const stage = resolveComplianceLadderStage(history);

      const policy = await enforceToolPolicy({
        vault,
        domain: "compliance",
        stage,
        toolName: "sendAdvisorAlert",
        agentType: ledgerAgentType,
        actionType: "NOTIFY_ADVISOR",
        reasoning,
        args: { subject },
      });

      // REGULATORY: never repeat advisor alerts within 5 days (prompt no-repeat rule).
      await vault.checkActionCooldown("NOTIFY_ADVISOR", 5);

      const client = (await vault.getClientProfile()) as {
        advisor: { email: string };
      };

      await sendTransactionalEmail({
        to: client.advisor.email,
        subject,
        text: body,
      });

      await vault.logAction({
        agentType: ledgerAgentType,
        actionType: "NOTIFY_ADVISOR",
        trigger: "SCHEDULED",
        reasoning,
        outcome: DRY_RUN ? "DRY_RUN" : "EMAIL_SENT",
        nextScheduledAt: addDemoDays(5),
        stage: policy.stage,
        policyVersion: policy.policyVersion,
        reasonCodes: ["POLICY_ALLOW_AUTO"],
      });

      return {
        success: true,
        dryRun: DRY_RUN,
        policyVersion: policy.policyVersion,
        agentType: ledgerAgentType,
      };
    },
  });
}
