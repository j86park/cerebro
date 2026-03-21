import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";

const inputSchema = z.object({
  reasoning: z
    .string()
    .min(20)
    .describe(
      "Detailed reasoning for alerting the advisor, including how long the client has been unresponsive"
    ),
  daysSinceLastResponse: z
    .number()
    .describe("Number of days since the client last responded or uploaded a document"),
});

const outputSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean(),
});

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

      // Enforce 3-day duplicate action cooldown
      await vault.checkActionCooldown("ALERT_ADVISOR_STUCK", 3);

      if (!DRY_RUN) {
        // TODO: Send advisor alert email via Resend
        void daysSinceLastResponse;
      }

      // Update onboarding status to STALLED
      const client = (await vault.getClientProfile()) as Record<
        string,
        unknown
      >;
      await vault.resetOnboarding(
        client.onboardingStage as number,
        "STALLED"
      );

      // Always log the action
      await vault.logAction({
        agentType: "ONBOARDING",
        actionType: "ALERT_ADVISOR_STUCK",
        trigger: "SCHEDULED",
        reasoning,
        outcome: DRY_RUN ? "DRY_RUN" : "ADVISOR_ALERTED",
        nextScheduledAt: new Date(
          new Date(env.DEMO_DATE).getTime() + 7 * 24 * 60 * 60 * 1000
        ),
      });

      return { success: true, dryRun: DRY_RUN };
    },
  });
}
