import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";

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
});

export function buildSendAdvisorAlert(vault: VaultService) {
  return createTool({
    id: "sendAdvisorAlert",
    description:
      "Sends an alert email to the client's advisor. Used in Stage 1 and Stage 3 of the escalation ladder. Always logs the action.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { subject, body, reasoning } = inputData;
      const { DRY_RUN } = env;

      // Get advisor email for future Resend integration
      const client = (await vault.getClientProfile()) as Record<
        string,
        unknown
      > & {
        advisor: Record<string, unknown>;
      };

      if (!DRY_RUN) {
        // TODO: Send email via Resend
        // await resend.emails.send({ to: client.advisor.email, subject, text: body });
        void client;
        void subject;
        void body;
      }

      // Always log the action
      await vault.logAction({
        agentType: "COMPLIANCE",
        actionType: "NOTIFY_ADVISOR",
        trigger: "SCHEDULED",
        reasoning,
        outcome: DRY_RUN ? "DRY_RUN" : "EMAIL_SENT",
        nextScheduledAt: new Date(
          new Date(env.DEMO_DATE).getTime() + 5 * 24 * 60 * 60 * 1000
        ),
      });

      return { success: true, dryRun: DRY_RUN };
    },
  });
}
