import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";
import { addDemoDays } from "@/lib/dates/demo-date";
import { sendTransactionalEmail } from "@/lib/email/resend";
import { enforceToolPolicy } from "@/lib/policy";

const inputSchema = z.object({
  reasoning: z
    .string()
    .min(20)
    .describe(
      "Detailed reasoning for alerting the advisor, including how long the client has been unresponsive",
    ),
  daysSinceLastResponse: z
    .number()
    .describe(
      "Number of days since the client last responded or uploaded a document",
    ),
});

const outputSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean(),
  policyVersion: z.string(),
});

/**
 * Builds alertAdvisorStuck onboarding tool (stage-gated via policy matrix).
 */
export function buildAlertAdvisorStuck(vault: VaultService) {
  return createTool({
    id: "alertAdvisorStuck",
    description:
      "Alerts the advisor that the client appears stuck in onboarding and has not responded within the threshold period. Transitions onboarding status to STALLED.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { reasoning, daysSinceLastResponse } = inputData;
      const { DRY_RUN } = env;

      const client = (await vault.getClientProfile()) as {
        name: string;
        onboardingStage: number;
        advisor: { email: string };
      };
      const stage = client.onboardingStage;

      const policy = await enforceToolPolicy({
        vault,
        domain: "onboarding",
        stage,
        toolName: "alertAdvisorStuck",
        agentType: "ONBOARDING",
        actionType: "ALERT_ADVISOR_STUCK",
        reasoning,
        args: { daysSinceLastResponse },
      });

      // Enforce 3-day duplicate action cooldown
      await vault.checkActionCooldown("ALERT_ADVISOR_STUCK", 3);

      await sendTransactionalEmail({
        to: client.advisor.email,
        subject: `Onboarding stuck: ${client.name}`,
        text:
          `Client ${client.name} appears stuck at onboarding stage ${stage} ` +
          `(${daysSinceLastResponse} day(s) since last response).\n\n${reasoning}`,
      });

      // Update onboarding status to STALLED
      await vault.resetOnboarding(stage, "STALLED");

      // Always log the action
      await vault.logAction({
        agentType: "ONBOARDING",
        actionType: "ALERT_ADVISOR_STUCK",
        trigger: "SCHEDULED",
        reasoning,
        outcome: DRY_RUN ? "DRY_RUN" : "ADVISOR_ALERTED",
        nextScheduledAt: addDemoDays(7),
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
